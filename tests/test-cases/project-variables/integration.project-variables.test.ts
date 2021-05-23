import {MockWriteStreams} from "../../../src/mock-write-streams";
import {handler} from "../../../src/handler";
import chalk from "chalk";

test.concurrent("project-variables <test-job>", async () => {
	const writeStreams = new MockWriteStreams();
	await handler({
		cwd: "tests/test-cases/project-variables",
		job: ["test-job"],
		home: "tests/test-cases/project-variables/.home",
	}, writeStreams);

	const expected = [
		chalk`{blueBright test-job  } {greenBright >} project-var-value`,
		chalk`{blueBright test-job  } {greenBright >} Im content of a file variable`,
	];
	expect(writeStreams.stdoutLines).toEqual(expect.arrayContaining(expected));
});

test.concurrent("project-variables <alpine-job>", async () => {
	const writeStreams = new MockWriteStreams();
	await handler({
		cwd: "tests/test-cases/project-variables",
		job: ["alpine-job"],
		home: "tests/test-cases/project-variables/.home",
	}, writeStreams);

	const expected = [
		chalk`{blueBright alpine-job} {greenBright >} project-var-value`,
		chalk`{blueBright alpine-job} {greenBright >} Im content of a file variable`,
	];
	expect(writeStreams.stdoutLines).toEqual(expect.arrayContaining(expected));
});
