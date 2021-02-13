import {Parser} from "../parser";
import * as fs from "fs";

test.concurrent('include remote (project, ref, file)', async () => {
    if (fs.existsSync("src/tests/test-cases/plain/.gitlab-ci-local/includes/inkscape/inkscape/INKSCAPE_1_0_2/.gitlab-ci.yml")) {
        fs.unlinkSync("src/tests/test-cases/plain/.gitlab-ci-local/includes/inkscape/inkscape/INKSCAPE_1_0_2/.gitlab-ci.yml");
    }
    await Parser.downloadIncludeFile("src/tests/test-cases/plain", "inkscape/inkscape", "INKSCAPE_1_0_2", ".gitlab-ci.yml", 'gitlab.com');
    const exists = fs.existsSync("src/tests/test-cases/plain/.gitlab-ci-local/includes/inkscape/inkscape/INKSCAPE_1_0_2/.gitlab-ci.yml");
    expect(exists).toEqual(true);
});

test.concurrent('include invalid remote (project, ref, file)', async () => {
    try {
        await Parser.downloadIncludeFile("src/tests/test-cases/plain", "inkscape/inkscape", "INVALID_TAG", ".gitlab-ci.yml", 'gitlab.com');
    } catch (e) {
        expect(e.message).toContain("exited with 2");
    }
});