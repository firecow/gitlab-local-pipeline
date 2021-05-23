import chalk from "chalk";
import deepExtend from "deep-extend";
import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import prettyHrtime from "pretty-hrtime";
import fetch from "node-fetch";
import {Job} from "./job";
import * as jobExpanders from "./job-expanders";
import {ExitError} from "./types/exit-error";
import {Utils} from "./utils";
import {assert} from "./asserts";
import * as path from "path";
import {WriteStreams} from "./types/write-streams";
import {ParserOptions} from "./types/parser-options";
import {Validator} from "./validator";
import {GitData} from "./types/git-data";

export class Parser {

    private readonly opt: ParserOptions;

    private _jobs: Map<string, Job> = new Map();
    private _stages: string[] = [];
    private _gitData: GitData | null = null;
    private _homeVariables: any;
    private _gitlabData: any;
    private _jobNamePad = 0;

    private constructor(opt: ParserOptions) {
        this.opt = opt;
    }

    get jobs(): ReadonlyMap<string, Job> {
        return this._jobs;
    }

    get stages(): readonly string[] {
        return this._stages;
    }

    get gitlabData() {
        return this._gitlabData;
    }

    get jobNamePad(): number {
        return this._jobNamePad;
    }

    static async create(opt: ParserOptions) {
        const writeStreams = opt.writeStreams;
        const parser = new Parser(opt);

        const time = process.hrtime();
        await parser.init();
        await Validator.validateNeedsTags(parser.jobs, parser.stages);
        const parsingTime = process.hrtime(time);

        if (opt.showInitMessage) {
            writeStreams.stdout(chalk`{cyan ${"yml files".padEnd(parser.jobNamePad)}} {magentaBright processed} in {magenta ${prettyHrtime(parsingTime)}}\n`);
        }

        return parser;
    }

    static async initGitData(cwd: string): Promise<GitData> {
        let gitlabUserEmail, gitlabUserName;

        try {
            const {stdout: gitConfigEmail} = await Utils.spawn("git config user.email", cwd);
            gitlabUserEmail = gitConfigEmail.trimEnd();
        } catch (e) {
            gitlabUserEmail = "local@gitlab.com";
        }
        const gitlabUserLogin = gitlabUserEmail.replace(/@.*/, "");
        try {
            const {stdout: gitConfigUserName} = await Utils.spawn("git config user.name", cwd);
            gitlabUserName = gitConfigUserName.trimEnd();
        } catch (e) {
            gitlabUserName = "Bob Local";
        }

        let gitConfig;
        if (fs.existsSync(`${cwd}/.git/config`)) {
            gitConfig = fs.readFileSync(`${cwd}/.git/config`, "utf8");
        } else if (fs.existsSync(`${cwd}/.gitconfig`)) {
            gitConfig = fs.readFileSync(`${cwd}/.gitconfig`, "utf8");
        } else {
            throw new ExitError("Could not locate.gitconfig or .git/config file");
        }
        const gitRemoteMatch = gitConfig.match(/url = .*(?:https:\/\/|@)(?<domain>.*?)[:|/](?<group>.*)\/(?<project>.*)(?:\r?\n|\.git)/);
        assert(gitRemoteMatch?.groups != null, "git config didn't provide valid matches");
        assert(gitRemoteMatch.groups.domain != null, "<domain> not found in git config");
        assert(gitRemoteMatch.groups.group != null, "<group> not found in git config");
        assert(gitRemoteMatch.groups.project != null, "<project> not found in git config");

        const {stdout: gitLogStdout} = await Utils.spawn("git log -1 --pretty=format:'%h %H %D'", cwd);
        const gitLogOutput = gitLogStdout.replace(/\r?\n/g, "");
        let gitLogMatch;
        if (gitLogOutput.match(/HEAD, tag/)) {
            gitLogMatch = gitLogOutput.match(/(?<short_sha>.*?) (?<sha>.*?) HEAD, tag: (?<ref_name>[\w_\-.]*)/);
        } else {
            gitLogMatch = gitLogOutput.match(/(?<short_sha>.*?) (?<sha>.*?) HEAD -> (?<ref_name>[\w_-]*)/);
        }
        assert(gitLogMatch?.groups != null, "git log -1 didn't provide valid matches");
        assert(gitLogMatch.groups.ref_name != null, "<ref_name> not found in git log -1");
        assert(gitLogMatch.groups.sha != null, "<sha> not found in git log -1");
        assert(gitLogMatch.groups.short_sha != null, "<short_sha> not found in git log -1");

        return {
            user: {
                GITLAB_USER_LOGIN: gitlabUserLogin,
                GITLAB_USER_EMAIL: gitlabUserEmail,
                GITLAB_USER_NAME: gitlabUserName,
            },
            remote: {
                domain: gitRemoteMatch.groups.domain,
                group: gitRemoteMatch.groups.group,
                project: gitRemoteMatch.groups.project,
            },
            commit: {
                REF_NAME: gitLogMatch.groups.ref_name,
                SHA: gitLogMatch.groups.sha,
                SHORT_SHA: gitLogMatch.groups.short_sha,
            },
        };
    }

    static async initHomeVariables(cwd: string, writeStreams: WriteStreams, gitData: GitData, home: string): Promise<{ [key: string]: string }> {
        const homeDir = home.replace(/\/$/, "");
        const variablesFile = `${homeDir}/.gitlab-ci-local/variables.yml`;
        if (!fs.existsSync(variablesFile)) {
            return {};
        }

        const data: any = yaml.load(await fs.readFile(variablesFile, "utf8"), {schema: yaml.FAILSAFE_SCHEMA});
        let variables: { [key: string]: string } = {};

        for (const [globalKey, globalEntry] of Object.entries(data?.global ?? [])) {
            if (typeof globalEntry !== "string") {
                continue;
            }
            variables[globalKey] = globalEntry;
        }

        const groupUrl = `${gitData.remote.domain}/${gitData.remote.group}/`;
        for (const [groupKey, groupEntries] of Object.entries(data?.group ?? [])) {
            if (!groupUrl.includes(Parser.normalizeProjectKey(groupKey, writeStreams))) {
                continue;
            }
            if (typeof groupEntries !== "object") {
                continue;
            }
            variables = {...variables, ...groupEntries};
        }

        const projectUrl = `${gitData.remote.domain}/${gitData.remote.group}/${gitData.remote.project}.git`;
        for (const [projectKey, projectEntries] of Object.entries(data?.project ?? [])) {
            if (!projectUrl.includes(Parser.normalizeProjectKey(projectKey, writeStreams))) {
                continue;
            }
            if (typeof projectEntries !== "object") {
                continue;
            }
            variables = {...variables, ...projectEntries};
        }

        const projectVariablesFile = `${cwd}/.gitlab-ci-local/variables.yml`;

        if (fs.existsSync(projectVariablesFile)) {
            const projectEntries: any = yaml.load(await fs.readFile(projectVariablesFile, "utf8"), {schema: yaml.FAILSAFE_SCHEMA}) ?? {};
            if (typeof projectEntries === "object") {
                variables = {...variables, ...projectEntries};
            }
        }

        // Generate files for file type variables
        for (const [key, value] of Object.entries(variables)) {
            if (typeof value !== "string") {
                continue;
            }
            if (!value.match(/^[/|~]/)) {
                continue;
            }

            if (value.match(/\/$/)) {
                continue;
            }

            const fromFilePath = value.replace(/^~\/(.*)/, `${homeDir}/$1`);
            if (fs.existsSync(fromFilePath)) {
                await fs.ensureDir(`${cwd}/.gitlab-ci-local/file-variables/`);
                await fs.copyFile(fromFilePath, `${cwd}/.gitlab-ci-local/file-variables/${path.basename(fromFilePath)}`);
                variables[key] = `.gitlab-ci-local/file-variables/${path.basename(fromFilePath)}`;
            }
        }

        return variables;
    }

    static normalizeProjectKey(key: string, writeStreams: WriteStreams): string {
        if (!key.includes(":")) {
            return key;
        }

        writeStreams.stderr(chalk`{yellow WARNING: Interpreting '${key}' as '${key.replace(":", "/")}'}\n`);

        return key.replace(":", "/");
    }

    async init() {
        const cwd = this.opt.cwd;
        const writeStreams = this.opt.writeStreams;
        const home = this.opt.home;
        const file = this.opt.file;
        const fetchIncludes = this.opt.fetchIncludes;
        const pipelineIid = this.opt.pipelineIid;
        const extraHosts = this.opt.extraHosts || [];

        this._gitData = await Parser.initGitData(cwd);
        this._homeVariables = await Parser.initHomeVariables(cwd, writeStreams, this._gitData, home ?? process.env.HOME ?? "");

        let ymlPath, yamlDataList: any[] = [{stages: [".pre", "build", "test", "deploy", ".post"]}];
        ymlPath = file ? `${cwd}/${file}` : `${cwd}/.gitlab-ci.yml`;
        const gitlabCiData = await Parser.loadYaml(ymlPath);
        yamlDataList = yamlDataList.concat(await Parser.prepareIncludes(gitlabCiData, cwd, writeStreams, this._gitData, fetchIncludes, 0));

        ymlPath = `${cwd}/.gitlab-ci-local.yml`;
        const gitlabCiLocalData = await Parser.loadYaml(ymlPath);
        yamlDataList = yamlDataList.concat(await Parser.prepareIncludes(gitlabCiLocalData, cwd, writeStreams, this._gitData, fetchIncludes, 0));

        const gitlabData: any = deepExtend({}, ...yamlDataList);

        // Expand various fields in gitlabData
        jobExpanders.reference(gitlabData, gitlabData);
        jobExpanders.jobExtends(gitlabData);
        jobExpanders.artifacts(gitlabData);
        jobExpanders.image(gitlabData);
        jobExpanders.beforeScripts(gitlabData);
        jobExpanders.afterScripts(gitlabData);
        jobExpanders.scripts(gitlabData);

        assert(gitlabData.stages && Array.isArray(gitlabData.stages), chalk`{yellow stages:} must be an array`);
        if (!gitlabData.stages.includes(".pre")) {
            gitlabData.stages.unshift(".pre");
        }
        if (!gitlabData.stages.includes(".post")) {
            gitlabData.stages.push(".post");
        }
        this._stages = gitlabData.stages;

        // Find longest job name
        Utils.forEachRealJob(gitlabData, (jobName) => {
            this._jobNamePad = Math.max(this.jobNamePad, jobName.length);
        });

        // Check that needs is larger and containers the same as dependencies.
        // TODO: We need this check, to prevent jobs from copying artifacts that might not be needed.

        // Check job variables for invalid hash of key value pairs
        Utils.forEachRealJob(gitlabData, (jobName, jobData) => {
            for (const [key, value] of Object.entries(jobData.variables || {})) {
                assert(
                    typeof value === "string" || typeof value === "number",
                    chalk`{blueBright ${jobName}} has invalid variables hash of key value pairs. ${key}=${value}`
                );
            }
        });

        this._gitlabData = gitlabData;

        // Generate jobs and put them into stages
        Utils.forEachRealJob(gitlabData, (jobName, jobData) => {
            assert(this._gitData != null, "GitRemote isn't set in parser initJobs function");
            const foundStage = this.stages.includes(jobData.stage);
            assert(foundStage, chalk`{yellow stage:${jobData.stage}} not found for {blueBright ${jobName}}`);

            const projectDir = jobData.imageName ? "/builds/" : `${cwd}`;
            const jobId = Math.floor(Math.random() * 1000000);
            const predefinedVariables = Utils.getPredefinedVariables(jobName, jobData.stage, jobId, pipelineIid, projectDir, this._gitData);
            const envs = {...gitlabData.variables || {}, ...jobData.variables || {}, ...predefinedVariables, ...process.env};
            const expandedGlobalVariables = Utils.expandVariables(gitlabData.variables || {}, envs);
            const expandedJobVariables = Utils.expandVariables(jobData.variables || {}, envs);
            const expandedVariables = {...expandedGlobalVariables, ...expandedJobVariables, ...this._homeVariables, ...predefinedVariables};
            const jobNamePad = this.jobNamePad;
            let producers: string[] = jobData.needs || jobData.dependencies;
            if (!producers) {
                // Populate with all jobName from previous stage
                producers = Utils.getJobNamesFromPreviousStages(gitlabData, this.stages, jobData.stage);
            }
            // Make sure potential producers actually has artifact paths.
            producers = producers.filter((producer) => gitlabData[producer]?.artifacts?.paths != null);

            const jobOptions = {
                extraHosts,
                writeStreams,
                jobName,
                jobData,
                cwd,
                jobId,
                pipelineIid,
                expandedVariables,
                jobNamePad,
                producers,
            };
            const job = new Job(jobOptions);
            this._jobs.set(jobName, job);
        });
    }

    static async loadYaml(filePath: string): Promise<any> {
        const ymlPath = `${filePath}`;
        if (!fs.existsSync(ymlPath)) {
            return {};
        }

        const fileContent = await fs.readFile(`${filePath}`, "utf8");
        const fileSplit = fileContent.split(/\r?\n/g);
        const fileSplitClone = fileSplit.slice();

        let interactiveMatch = null;
        let descriptionMatch = null;
        let injectSSHAgent = null;
        let index = 0;
        for (const line of fileSplit) {
            interactiveMatch = !interactiveMatch ? line.match(/#[\s]?@[\s]?[Ii]nteractive/) : interactiveMatch;
            injectSSHAgent = !injectSSHAgent ? line.match(/#[\s]?@[\s]?[Ii]njectSSHAgent/) : injectSSHAgent;
            descriptionMatch = !descriptionMatch ? line.match(/#[\s]?@[\s]?[Dd]escription (?<description>.*)/) : descriptionMatch;
            const jobMatch = line.match(/(?<jobname>\w):/);
            if (jobMatch && (interactiveMatch || descriptionMatch || injectSSHAgent)) {
                if (interactiveMatch) {
                    fileSplitClone.splice(index + 1, 0, "  interactive: true");
                    index++;
                }
                if (injectSSHAgent) {
                    fileSplitClone.splice(index + 1, 0, "  injectSSHAgent: true");
                    index++;
                }
                if (descriptionMatch) {
                    fileSplitClone.splice(index + 1, 0, `  description: ${descriptionMatch?.groups?.description ?? ""}`);
                    index++;
                }
                interactiveMatch = null;
                descriptionMatch = null;
                injectSSHAgent = null;
            }
            index++;
        }

        const referenceType = new yaml.Type("!reference", {
            kind: "sequence",
            construct: function (data) {
                return {referenceData: data};
            },
        });
        const schema = yaml.DEFAULT_SCHEMA.extend([referenceType]);
        return yaml.load(fileSplitClone.join("\n"), {schema}) || {};
    }

    static async downloadIncludeRemote(cwd: string, writeStreams: WriteStreams, url: string): Promise<void> {
        const time = process.hrtime();
        const fsUrl = Utils.fsUrl(url);
        const res = await fetch(url);
        if (res.status !== 200) {
            throw new ExitError(`Remote include could not be fetched ${url}`);
        }
        fs.outputFileSync(`${cwd}/.gitlab-ci-local/includes/${fsUrl}`, await res.text());
        const endTime = process.hrtime(time);
        writeStreams.stdout(chalk`{cyan downloaded} {magentaBright ${url}} in {magenta ${prettyHrtime(endTime)}}\n`);
    }

    static async downloadIncludeProjectFile(cwd: string, writeStreams: WriteStreams, project: string, ref: string, file: string, gitRemoteDomain: string): Promise<void> {
        const time = process.hrtime();
        fs.ensureDirSync(`${cwd}/.gitlab-ci-local/includes/${gitRemoteDomain}/${project}/${ref}/`);
        const normalizedFile = file.replace(/^\/+/, "");
        try {
            await Utils.spawn(`git archive --remote=git@${gitRemoteDomain}:${project}.git ${ref} ${normalizedFile} | tar -xC .gitlab-ci-local/includes/${gitRemoteDomain}/${project}/${ref}/`, cwd);
        } catch (e) {
            throw new ExitError(`Project include could not be fetched { project: ${project}, ref: ${ref}, file: ${normalizedFile} }`);
        }

        const endTime = process.hrtime(time);
        const remoteUrl = `${gitRemoteDomain}/${project}/${normalizedFile}`;
        writeStreams.stdout(chalk`{cyan downloaded} {magentaBright ${remoteUrl}} in {magenta ${prettyHrtime(endTime)}}\n`);
    }

    static async prepareIncludes(gitlabData: any, cwd: string, writeStreams: WriteStreams, gitData: GitData, fetchIncludes: boolean, depth: number): Promise<any[]> {
        let includeDatas: any[] = [];
        const promises = [];

        assert(depth < 100, chalk`circular dependency detected in \`include\``);
        depth++;

        // Find files to fetch from remote and place in .gitlab-ci-local/includes
        for (const value of gitlabData["include"] || []) {
            if (!fetchIncludes) {
                continue;
            }
            if (value["local"]) {
                const fileExists = fs.existsSync(`${cwd}/${value["local"]}`);
                if (!fileExists) {
                    throw new ExitError(`Local include file cannot be found ${value["local"]}`);
                }
            } else if (value["file"]) {
                promises.push(Parser.downloadIncludeProjectFile(cwd, writeStreams, value["project"], value["ref"] || "master", value["file"], gitData.remote.domain));
            } else if (value["template"]) {
                const {project, ref, file, domain} = Parser.parseTemplateInclude(value["template"]);
                promises.push(Parser.downloadIncludeProjectFile(cwd, writeStreams, project, ref, file, domain));
            } else if (value["remote"]) {
                promises.push(Parser.downloadIncludeRemote(cwd, writeStreams, value["remote"]));
            }

        }

        await Promise.all(promises);

        for (const value of gitlabData["include"] || []) {
            if (value["local"]) {
                const localDoc = await Parser.loadYaml(`${cwd}/${value.local}`);
                includeDatas = includeDatas.concat(await Parser.prepareIncludes(localDoc, cwd, writeStreams, gitData, fetchIncludes, depth));
            } else if (value["project"]) {
                const fileDoc = await Parser.loadYaml(`${cwd}/.gitlab-ci-local/includes/${gitData.remote.domain}/${value["project"]}/${value["ref"] || "master"}/${value["file"]}`);

                // Expand local includes inside a "project"-like include
                (fileDoc["include"] || []).forEach((inner: any, i: number) => {
                    if (inner["local"]) {
                        fileDoc["include"][i] = {
                            project: value["project"],
                            file: inner["local"].replace(/^\//, ""),
                            ref: value["ref"],
                        };
                    }
                });

                includeDatas = includeDatas.concat(await Parser.prepareIncludes(fileDoc, cwd, writeStreams, gitData, fetchIncludes, depth));
            } else if (value["template"]) {
                const {project, ref, file, domain} = Parser.parseTemplateInclude(value["template"]);
                const fileDoc = await Parser.loadYaml(`${cwd}/.gitlab-ci-local/includes/${domain}/${project}/${ref}/${file}`);
                includeDatas = includeDatas.concat(await Parser.prepareIncludes(fileDoc, cwd, writeStreams, gitData, fetchIncludes, depth));
            } else if (value["remote"]) {
                const fsUrl = Utils.fsUrl(value["remote"]);
                const fileDoc = await Parser.loadYaml(`${cwd}/.gitlab-ci-local/includes/${fsUrl}`);
                includeDatas = includeDatas.concat(await Parser.prepareIncludes(fileDoc, cwd, writeStreams, gitData, fetchIncludes, depth));
            } else {
                throw new ExitError(`Didn't understand include ${JSON.stringify(value)}`);
            }
        }

        includeDatas.push(gitlabData);
        return includeDatas;
    }

    static parseTemplateInclude(template: string): { project: string; ref: string; file: string; domain: string } {
        return {
            domain: "gitlab.com",
            project: "gitlab-org/gitlab",
            ref: "master",
            file: `lib/gitlab/ci/templates/${template}`,
        };
    }
}
