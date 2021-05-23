import chalk from "chalk";
import * as childProcess from "child_process";
import {ExitError} from "./types/exit-error";
import {Job} from "./job";
import {assert} from "./asserts";
import * as fs from "fs-extra";
import base32Encode from "base32-encode";
import camelCase from "camelcase";
import {GitData} from "./types/git-data";

export class Utils {

    static spawn(command: string, cwd = process.cwd(), env: { [key: string]: string | undefined } = process.env): Promise<{ stdout: string; stderr: string; output: string; status: number }> {
        return new Promise((resolve, reject) => {
            const cp = childProcess.spawn(command, {shell: "bash", env, cwd});

            let output = "";
            let stdout = "";
            let stderr = "";

            cp.stderr.on("data", (buff) => {
                stderr += buff.toString();
                output += buff.toString();
            });
            cp.stdout.on("data", (buff) => {
                stdout += buff.toString();
                output += buff.toString();
            });
            cp.on("exit", (status) => {
                if ((status ?? 0) === 0) {
                    return setTimeout(() => resolve({stdout, stderr, output, status: status ?? 0}), 10);
                }
                return setTimeout(() => reject(new ExitError(`${output}`)), 10);
            });
            cp.on("error", (e) => {
                return setTimeout(() => reject(new ExitError(`'${command}' had errors\n${e}`)), 10);
            });

        });
    }

    static fsUrl(url: string): string {
        return url.replace(/^https:\/\//g, "").replace(/^http:\/\//g, "");
    }

    static getJobByName(jobs: ReadonlyMap<string, Job>, name: string): Job {
        const job = jobs.get(name);
        assert(job != null, chalk`{blueBright ${name}} could not be found`);
        return job;
    }

    static forEachRealJob(gitlabData: any, callback: (jobName: string, jobData: any) => void) {
        for (const [jobName, jobData] of Object.entries<any>(gitlabData)) {
            if (Job.illegalJobNames.includes(jobName) || jobName[0] === ".") {
                continue;
            }
            callback(jobName, jobData);
        }
    }

    static getJobNamesFromPreviousStages(gitlabData: any, stages: readonly string[], currentStage: string) {
        const jobNames: string[] = [];
        const currentStageIndex = stages.indexOf(currentStage);
        Utils.forEachRealJob(gitlabData, (jobName, jobData) => {
            const stageIndex = stages.indexOf(jobData.stage);
            if (stageIndex < currentStageIndex) {
                jobNames.push(jobName);
            }
        });
        return jobNames;
    }

    static async getCoveragePercent(cwd: string, coverageRegex: string, jobName: string) {
        const content = await fs.readFile(`${cwd}/.gitlab-ci-local/output/${jobName}.log`, "utf8");
        const regex = new RegExp(coverageRegex.replace(/^\//, "").replace(/\/$/, ""), "m");
        const match = content.match(regex);
        if (match && match[0] != null) {
            const firstNumber = match[0].match(/\d+(\.\d+)?/);
            return firstNumber && firstNumber[0] ? firstNumber[0] : null;
        }
        return "0";
    }

    static safeJobName(name: string) {
        return name.replace(/[^\w_-]+/g, (match) => {
            const buffer = new ArrayBuffer(match.length * 2);
            const bufView = new Uint16Array(buffer);
            for (let i = 0, len = match.length; i < len; i++) {
                bufView[i] = match.charCodeAt(i);
            }
            return base32Encode(buffer, "Crockford");
        });
    }

    static printJobNames(stream: (txt: string) => void, job: { name: string }, i: number, arr: { name: string }[]) {
        if (i === arr.length - 1) {
            stream(chalk`{blueBright ${job.name}}`);
        } else {
            stream(chalk`{blueBright ${job.name}}, `);
        }
    }

    static expandText(text?: any, envs: { [key: string]: string | undefined } = process.env) {
        if (typeof text !== "string") {
            return text;
        }
        return text.replace(/[$][{]?\w*[}]?/g, (match) => {
            const sub = envs[match.replace(/^[$][{]?/, "").replace(/[}]?$/, "")];
            return sub || match;
        });
    }

    static expandVariables(variables: { [key: string]: string }, envs: { [key: string]: string }): { [key: string]: string } {
        const expandedVariables: { [key: string]: string } = {};
        for (const [key, value] of Object.entries(variables)) {
            expandedVariables[key] = Utils.expandText(value, envs);
        }
        return expandedVariables;
    }

    static getRulesResult(rules: { if?: string; when?: string; allow_failure?: boolean }[], variables: { [key: string]: string }): { when: string; allowFailure: boolean } {
        let when = "never";
        let allowFailure = false;

        for (const rule of rules) {
            if (Utils.evaluateRuleIf(rule.if || "true", variables)) {
                when = rule.when ? rule.when : "on_success";
                allowFailure = rule.allow_failure ?? false;
                break;
            }
        }

        return {when, allowFailure};
    }

    static evaluateRuleIf(ruleIf: string, envs: { [key: string]: string }) {
        const expandedRule = ruleIf.replace(/[$]\w*/g, (match) => {
            const sub = envs[match.replace(/^[$]/, "")];
            return sub != null ? `'${sub}'` : "null";
        });

        const subRules = expandedRule.split(/&&|\|\|/g);
        const subEvals = [];
        for (const subRule of subRules) {
            let subEval = subRule;

            if (subRule.includes("!~")) {
                subEval = subRule.replace(/\s*!~\s*(\/.*\/)/, ".match($1) == null");
                subEval = subEval.match(/^null/) ? "false" : subEval;
            } else if (subRule.includes("=~")) {
                subEval = subRule.replace(/\s*=~\s*(\/.*\/)/, ".match($1) != null");
                subEval = subEval.match(/^null/) ? "false" : subEval;
            } else if (!subRule.match(/==|!=/)) {
                if (subRule.match(/null/)) {
                    subEval = subRule.replace(/(\s*)\S*(\s*)/, "$1false$2");
                } else if (subRule.match(/''/)) {
                    subEval = subRule.replace(/'(\s?)\S*(\s)?'/, "$1false$2");
                } else {
                    subEval = subRule.replace(/'(\s?)\S*(\s)?'/, "$1true$2");
                }
            }

            subEvals.push(subEval);
        }

        const conditions = expandedRule.match(/&&|\|\|/g);

        let evalStr = "";

        subEvals.forEach((subEval, index) => {
            evalStr += subEval;
            evalStr += conditions && conditions[index] ? conditions[index] : "";
        });

        return eval(evalStr);
    }

    static async rsyncNonIgnoredFilesToBuilds(cwd: string, target: string): Promise<{ hrdeltatime: [number, number] }> {
        const time = process.hrtime();
        await fs.ensureDir(`${cwd}/.gitlab-ci-local/builds/${target}`);
        await Utils.spawn(`rsync -a --delete --exclude-from=<(git -C . ls-files --exclude-standard -oi --directory) --exclude .git/ --exclude .gitlab-ci-local/ ./ .gitlab-ci-local/builds/${target}/`, cwd);
        return {hrdeltatime: process.hrtime(time)};
    }

    static getPredefinedVariables( jobName: string, jobStage: string, jobId: number, pipelineIid: number, projectDir: string, gitData: GitData): { [key: string]: string } {
        return {
            GITLAB_USER_LOGIN: gitData.user["GITLAB_USER_LOGIN"],
            GITLAB_USER_EMAIL: gitData.user["GITLAB_USER_EMAIL"],
            GITLAB_USER_NAME: gitData.user["GITLAB_USER_NAME"],
            CI_COMMIT_SHORT_SHA: gitData.commit.SHORT_SHA, // Changes
            CI_COMMIT_SHA: gitData.commit.SHA,
            CI_PROJECT_DIR: projectDir,
            CI_PROJECT_NAME: gitData.remote.project,
            CI_PROJECT_TITLE: `${camelCase(gitData.remote.project)}`,
            CI_PROJECT_PATH: `${gitData.remote.group}/${camelCase(gitData.remote.project)}`,
            CI_PROJECT_PATH_SLUG: `${gitData.remote.group.replace(/\//g, "-")}-${gitData.remote.project}`,
            CI_PROJECT_NAMESPACE: `${gitData.remote.group}`,
            CI_PROJECT_VISIBILITY: "internal",
            CI_PROJECT_ID: "1217",
            CI_COMMIT_REF_PROTECTED: "false",
            CI_COMMIT_BRANCH: gitData.commit.REF_NAME, // Not available in merge request or tag pipelines
            CI_COMMIT_REF_NAME: gitData.commit.REF_NAME, // Tag or branch name
            CI_COMMIT_REF_SLUG: gitData.commit.REF_NAME.replace(/[^a-z0-9]+/ig, "-").replace(/^-/, "").replace(/-$/, "").slice(0, 63).toLowerCase(),
            CI_COMMIT_TITLE: "Commit Title", // First line of commit message.
            CI_COMMIT_MESSAGE: "Commit Title\nMore commit text", // Full commit message
            CI_COMMIT_DESCRIPTION: "More commit text",
            CI_PIPELINE_SOURCE: "push",
            CI_JOB_ID: `${jobId}`,
            CI_PIPELINE_ID: `${pipelineIid + 1000}`,
            CI_PIPELINE_IID: `${pipelineIid}`,
            CI_SERVER_HOST: `${gitData.remote.domain}`,
            CI_SERVER_URL: `https://${gitData.remote.domain}:443`,
            CI_API_V4_URL: `https://${gitData.remote.domain}/api/v4`,
            CI_PROJECT_URL: `https://${gitData.remote.domain}/${gitData.remote.group}/${gitData.remote.project}`,
            CI_JOB_URL: `https://${gitData.remote.domain}/${gitData.remote.group}/${gitData.remote.project}/-/jobs/${jobId}`, // Changes on rerun.
            CI_PIPELINE_URL: `https://${gitData.remote.domain}/${gitData.remote.group}/${gitData.remote.project}/pipelines/${pipelineIid}`,
            CI_JOB_NAME: `${jobName}`,
            CI_JOB_STAGE: `${jobStage}`,
            GITLAB_CI: "false",
        };
    }

}
