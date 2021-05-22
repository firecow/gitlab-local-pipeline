import * as yaml from "js-yaml";
import chalk from "chalk";
import * as fs from "fs-extra";
import * as yargs from "yargs";
import {Commander} from "./commander";
import {Parser} from "./parser";
import * as state from "./state";
import {assert} from "./asserts";
import * as dotenv from "dotenv";
import camelCase from "camelcase";
import prettyHrtime from "pretty-hrtime";
import {WriteStreams} from "./types/write-streams";
import {Job} from "./job";
import {Utils} from "./utils";

const checkFolderAndFile = (cwd: string, file?: string) => {
    assert(fs.pathExistsSync(cwd), `${cwd} is not a directory`);

    const gitlabFilePath = file ? `${cwd}/${file}` : `${cwd}/.gitlab-ci.yml`;
    assert(fs.existsSync(gitlabFilePath), `${cwd} does not contain ${file ?? ".gitlab-ci.yml"}`);
};

const generateGitIgnore = (cwd: string) => {
    const gitIgnoreFilePath = `${cwd}/.gitlab-ci-local/.gitignore`;
    const gitIgnoreContent = "*\n!.gitignore\n";
    if (!fs.existsSync(gitIgnoreFilePath)) {
        fs.outputFileSync(gitIgnoreFilePath, gitIgnoreContent);
    }
};

export async function handler(argv: any, writeStreams: WriteStreams): Promise<ReadonlyMap<string, Job>> {
    assert(typeof argv.cwd != "object", "--cwd option cannot be an array");
    const cwd = argv.cwd?.replace(/\/$/, "") ?? ".";

    process.on("SIGINT", async (_: string, code: number) => {
        if (!parser) {
            return process.exit(code);
        }
        const promises = [];
        for (const job of parser.jobs.values()) {
            promises.push(job.cleanupResources());
        }
        await Promise.all(promises);
        process.exit(code);
    });

    let parser: Parser | null = null;

    if (fs.existsSync(`${cwd}/.gitlab-ci-local-env`)) {
        const config = dotenv.parse(fs.readFileSync(`${cwd}/.gitlab-ci-local-env`));
        for (const [key, value] of Object.entries(config)) {
            const argKey = camelCase(key);
            if (argv[argKey] == null) {
                argv[argKey] = value;
            }
        }
    }

    if (argv.completion != null) {
        yargs.showCompletionScript();
    } else if (argv.preview != null) {
        const pipelineIid = await state.getPipelineIid(cwd);
        parser = await Parser.create({
            cwd, writeStreams, pipelineIid, showInitMessage: false, fetchIncludes: true, file: argv.file, home: argv.home, extraHosts: argv.extraHost,
        });
        const gitlabData = parser.gitlabData;
        for (const jobName of Object.keys(gitlabData)) {
            if (jobName === "stages") {
                continue;
            }
            if (Job.illegalJobNames.includes(jobName) || jobName.startsWith(".")) {
                delete gitlabData[jobName];
            }
        }
        writeStreams.stdout(`---\n${yaml.dump(gitlabData, { lineWidth: 160 })}`);
    } else if (argv.list != null) {
        checkFolderAndFile(cwd, argv.file);
        const pipelineIid = await state.getPipelineIid(cwd);
        parser = await Parser.create({
            cwd, writeStreams, pipelineIid, showInitMessage: false, fetchIncludes: true, file: argv.file, home: argv.home, extraHosts: argv.extraHost,
        });
        Commander.runList(parser, writeStreams);
    } else if (argv.job) {
        const time = process.hrtime();
        checkFolderAndFile(cwd, argv.file);
        generateGitIgnore(cwd);
        if (argv.needs === true) {
            await fs.remove(`${cwd}/.gitlab-ci-local/artifacts`);
            await state.incrementPipelineIid(cwd);
        }
        const pipelineIid = await state.getPipelineIid(cwd);
        parser = await Parser.create({
            cwd, writeStreams, pipelineIid, showInitMessage: true, fetchIncludes: true, file: argv.file, home: argv.home, extraHosts: argv.extraHost,
        });
        await Utils.rsyncNonIgnoredFilesToBuilds(cwd, ".docker");
        await Commander.runSingleJob(parser, writeStreams, argv.job, argv.needs || false, argv.manual || [], argv.privileged || false);
        if (argv.needs === true) {
            writeStreams.stdout(chalk`{grey pipeline finished} in {grey ${prettyHrtime(process.hrtime(time))}}\n`);
        }
    } else {
        const time = process.hrtime();
        checkFolderAndFile(cwd, argv.file);
        generateGitIgnore(cwd);
        await fs.remove(`${cwd}/.gitlab-ci-local/artifacts`);
        await state.incrementPipelineIid(cwd);
        const pipelineIid = await state.getPipelineIid(cwd);
        parser = await Parser.create({
            cwd, writeStreams, pipelineIid, showInitMessage: true, fetchIncludes: true, file: argv.file, home: argv.home, extraHosts: argv.extraHost,
        });
        await Utils.rsyncNonIgnoredFilesToBuilds(cwd, ".docker");
        await Commander.runPipeline(parser, writeStreams, argv.manual || [], argv.privileged || false);
        writeStreams.stdout(chalk`{grey pipeline finished} in {grey ${prettyHrtime(process.hrtime(time))}}\n`);
    }
    writeStreams.flush();

    if (parser) {
        return parser.jobs;
    }

    return new Map<string, Job>();
}

