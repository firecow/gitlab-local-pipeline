import chalk from "chalk";
import deepExtend from "deep-extend";
import {Utils} from "./utils";
import {assert} from "./asserts";
import {Job} from "./job";

const extendsMaxDepth = 11;
const extendsRecurse = (gitlabData: any, jobName: string, jobData: any, parents: any[], depth: number) => {
    assert(depth < extendsMaxDepth, chalk`{blueBright build-job}: circular dependency detected in \`extends\``);
    depth++;
    for (const parentName of (jobData.extends || []).reverse()) {
        const parentData = gitlabData[parentName];
        assert(parentData != null, chalk`{blueBright ${parentName}} is extended from {blueBright ${jobName}}, but is unspecified`);
        parents = parents.concat(extendsRecurse(gitlabData, parentName, parentData, parents, depth));
        parents.push(parentData);
    }
    return parents;
};

export function jobExtends(gitlabData: any) {
    for (const [jobName, jobData] of Object.entries<any>(gitlabData)) {
        if (Job.illegalJobNames.includes(jobName)) continue;
        jobData.extends = typeof jobData.extends === "string" ? [jobData.extends] : jobData.extends ?? [];
    }

    Utils.forEachRealJob(gitlabData, (jobName, jobData) => {
        const parentDatas = extendsRecurse(gitlabData, jobName, jobData, [], 0);
        gitlabData[jobName] = deepExtend({}, ...parentDatas, jobData);
    });

    for (const [jobName, jobData] of Object.entries<any>(gitlabData)) {
        if (Job.illegalJobNames.includes(jobName)) continue;
        delete jobData.extends;
    }
}

export function reference(gitlabData: any, recurseData: any) {
    for (const [key, value] of Object.entries<any>(recurseData || {})) {
        if (value && value.referenceData) {
            recurseData[key] = getSubDataByReference(gitlabData, value.referenceData);
        } else if (typeof value === "object") {
            reference(gitlabData, value);
        }
    }
}

const getSubDataByReference = (gitlabData: any, referenceData: string[]) => {
    let gitlabSubData = gitlabData;
    referenceData.forEach((referencePointer) => {
        gitlabSubData = gitlabSubData[referencePointer];
    });
    return gitlabSubData;
};

export function artifacts(gitlabData: any) {
    Utils.forEachRealJob(gitlabData, (_, jobData) => {
        const expandedArtifacts = jobData.artifacts || (gitlabData.default || {}).artifacts || gitlabData.artifacts;
        if (expandedArtifacts) {
            jobData.artifacts = expandedArtifacts;
        }
    });
}

export function image(gitlabData: any) {
    Utils.forEachRealJob(gitlabData, (_, jobData) => {
        const expandedImage = jobData.image || (gitlabData.default || {}).image || gitlabData.image;
        if (expandedImage) {
            jobData.image = {
                name: typeof expandedImage === "string" ? expandedImage : expandedImage.name,
                entrypoint: expandedImage.entrypoint,
            };
        }
    });
}

const expandMultidimension = (inputArr: any) => {
    const arr = [];
    for (const line of inputArr) {
        if (typeof line == "string") {
            arr.push(line);
        } else {
            line.forEach((l: string) => arr.push(l));
        }
    }
    return arr;
};

export function beforeScripts(gitlabData: any) {
    Utils.forEachRealJob(gitlabData, (_, jobData) => {
        const expandedBeforeScripts = [].concat(jobData.before_script || (gitlabData.default || {}).before_script || gitlabData.before_script || []);
        if (expandedBeforeScripts.length > 0) {
            jobData.before_script = expandMultidimension(expandedBeforeScripts);
        }
    });
}

export function afterScripts(gitlabData: any) {
    Utils.forEachRealJob(gitlabData, (_, jobData) => {
        const expandedAfterScripts = [].concat(jobData.after_script || (gitlabData.default || {}).after_script || gitlabData.after_script || []);
        if (expandedAfterScripts.length > 0) {
            jobData.after_script = expandMultidimension(expandedAfterScripts);
        }
    });
}

export function scripts(gitlabData: any) {
    Utils.forEachRealJob(gitlabData, (jobName, jobData) => {
        assert(jobData.script || jobData.trigger, chalk`{blueBright ${jobName}} must have script specified`);
        jobData.script = typeof jobData.script === "string" ? [jobData.script] : jobData.script;
        if (jobData.script) {
            jobData.script = expandMultidimension(jobData.script);
        }
    });
}
