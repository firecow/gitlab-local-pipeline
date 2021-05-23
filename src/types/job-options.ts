import {WriteStreams} from "./write-streams";

export interface JobOptions {
    writeStreams: WriteStreams;
    jobData: any;
    jobName: string;
    jobNamePad: number;
    cwd: string;
    expandedVariables: { [name: string]: string };
    pipelineIid: number;
    jobId: number;
    extraHosts: string[];
    producers: string[];
}
