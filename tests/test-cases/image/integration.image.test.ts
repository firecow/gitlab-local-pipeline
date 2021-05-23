import {MockWriteStreams} from "../../../src/mock-write-streams";
import {handler} from "../../../src/handler";
import chalk from "chalk";

test.concurrent("image <test job>", async () => {
    const writeStreams = new MockWriteStreams();
    await handler({
        cwd: "tests/test-cases/image",
        job: ["test job"],
    }, writeStreams);
    const expected = [chalk`{blueBright test job                } {greenBright >} Test something`];
    expect(writeStreams.stdoutLines).toEqual(expect.arrayContaining(expected));
});

test.concurrent("image <test-entrypoint>", async () => {
    const writeStreams = new MockWriteStreams();
    await handler({
        cwd: "tests/test-cases/image",
        job: ["test-entrypoint"],
        privileged: true,
    }, writeStreams);

    const expected = [
        chalk`{blueBright test-entrypoint         } {greenBright >} Hello from 'firecow/gitlab-ci-local-test-image' image entrypoint`,
        chalk`{blueBright test-entrypoint         } {greenBright >} I am epic multiline value`,
        chalk`{blueBright test-entrypoint         } {greenBright >} /builds/test-entrypoint`,
        chalk`{blueBright test-entrypoint         } {greenBright >} Test Entrypoint`,
        chalk`{blueBright test-entrypoint         } {greenBright >} I'm a test file`,
    ];
    expect(writeStreams.stdoutLines).toEqual(expect.arrayContaining(expected));
});

test.concurrent("image <test-entrypoint-override>", async () => {
    const writeStreams = new MockWriteStreams();
    await handler({
        cwd: "tests/test-cases/image",
        job: ["test-entrypoint-override"],
    }, writeStreams);

    const expected = [
        chalk`{blueBright test-entrypoint-override} {greenBright >} Test something`,
    ];
    expect(writeStreams.stdoutLines).toEqual(expect.arrayContaining(expected));
});

test.concurrent("image <test-from-scratch>", async () => {
    const writeStreams = new MockWriteStreams();
    await handler({
        cwd: "tests/test-cases/image",
        job: ["test-from-scratch"],
    }, writeStreams);

    expect(writeStreams.stdoutLines[5]).toEqual(chalk`{blueBright test-from-scratch       } {greenBright >} 0:0 .gitlab-ci.yml`);
    expect(writeStreams.stdoutLines[7]).toEqual(chalk`{blueBright test-from-scratch       } {greenBright >} 666 .gitlab-ci.yml`);
    expect(writeStreams.stdoutLines[9]).toEqual(chalk`{blueBright test-from-scratch       } {greenBright >} 777 folder/`);
    expect(writeStreams.stdoutLines[11]).toEqual(chalk`{blueBright test-from-scratch       } {greenBright >} 777 executable.sh`);
    expect(writeStreams.stderrLines).toEqual([]);
});
