import {MockWriteStreams} from "../../../src/mock-write-streams";
import {handler} from "../../../src/handler";

test("artifacts-with-cache <test-job> --needs", async () => {
    const writeStreams = new MockWriteStreams();
    await handler({
        cwd: "tests/test-cases/artifacts-with-cache",
        jobs: ["test-job"],
        needs: true,
    }, writeStreams);

});
