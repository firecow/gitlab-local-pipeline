import {MockWriteStreams} from "../../../src/mock-write-streams";
import {handler} from "../../../src/handler";
import chalk from "chalk";

test("artifacts-with-cache <test-job> --needs", async () => {
    const writeStreams = new MockWriteStreams();
    await handler({
        cwd: "tests/test-cases/artifacts-with-cache",
        jobs: ["test-job"],
        needs: true,
    }, writeStreams);

    const expected = [
        chalk`{black.bgGreenBright  PASS } {blueBright prejob  }`,
        chalk`{black.bgGreenBright  PASS } {blueBright test-job}`,
    ];
    expect(writeStreams.stdoutLines).toEqual(expect.arrayContaining(expected));

});
