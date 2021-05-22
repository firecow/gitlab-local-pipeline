import {MockWriteStreams} from "../../../src/mock-write-streams";
import {handler} from "../../../src/handler";
import chalk from "chalk";

jest.setTimeout(13000);

test("long-running-silent-build-job <build-job>", async () => {
    const writeStreams = new MockWriteStreams();
    await handler({
        cwd: "tests/test-cases/long-running-silent-build-job",
        job: ["build-job"],
    }, writeStreams);

    expect(writeStreams.stdoutLines[5]).toEqual(chalk`{blueBright build-job} {greenBright >} 1`);
    expect(writeStreams.stdoutLines[8]).toEqual(chalk`{blueBright build-job} {greenBright >} 2`);
    expect(writeStreams.stdoutLines[11]).toEqual(chalk`{blueBright build-job} {greenBright >} 3`);
    expect(writeStreams.stdoutLines[14]).toEqual(chalk`{blueBright build-job} {greenBright >} 4`);
    expect(writeStreams.stdoutLines[17]).toEqual(chalk`{blueBright build-job} {greenBright >} 5`);
    expect(writeStreams.stdoutLines[20]).toEqual(chalk`{blueBright build-job} {greenBright >} 6`);
    expect(writeStreams.stdoutLines[23]).toEqual(chalk`{blueBright build-job} {greenBright >} 7`);
    expect(writeStreams.stdoutLines[26]).toEqual(chalk`{blueBright build-job} {greenBright >} 8`);
    expect(writeStreams.stdoutLines[29]).toEqual(chalk`{blueBright build-job} {greenBright >} 9`);
    expect(writeStreams.stdoutLines[32]).toEqual(chalk`{blueBright build-job} {greenBright >} 10`);
    expect(writeStreams.stdoutLines[35]).toEqual(chalk`{blueBright build-job} {greenBright >} 11`);
    expect(writeStreams.stderrLines).toEqual([]);
});
