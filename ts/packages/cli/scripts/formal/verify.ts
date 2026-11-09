#!/usr/bin/env bun
// Model checking and regression sensitivity run outside the checkout.
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from './manifest.json';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const cli = path.join(repo, 'ts/packages/cli');
const javaTool = 'java@temurin-25.0.5+8.0.LTS';
const tlcTool =
  'http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4';

const hashFile = async (file: string) =>
  new Uint8Array(
    await crypto.subtle.digest('SHA-256', new Uint8Array(await fs.readFile(file)))
  ).toHex();

async function command(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, text: stdout + stderr };
}

async function requireSuccess(args: string[], cwd: string) {
  const result = await command(args, cwd);
  if (result.code !== 0) throw new Error(`${args[0]} failed (${result.code}):\n${result.text}`);
  return result.text.trim();
}

const args = process.argv.slice(2);
const key = args[0];
if (!Object.hasOwn(manifest, key) || args.slice(1).some(arg => arg !== '--mutations')) {
  throw new Error(
    `Usage: bun ts/packages/cli/scripts/formal/verify.ts <${Object.keys(manifest).join('|')}> [--mutations]`
  );
}
const entry = manifest[key as keyof typeof manifest];
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), `cli-formal-${key}-`));
process.stdout.write(`Evidence: ${scratch}\n`);

for (const [file, expected] of Object.entries(entry.sources)) {
  const digest = await hashFile(path.join(cli, file));
  if (digest !== expected) {
    throw new Error(
      `${file} changed since ${entry.syncCommit}. Review model/source correspondence before updating the coverage hash.`
    );
  }
}

const modelDir = path.join(scratch, 'model');
await fs.cp(path.join(repo, '.agents/skills', entry.skill, 'models'), modelDir, {
  recursive: true,
});
// Keep machine setup in mise. The artifact and Java versions are explicit; TLC's jar is checksum pinned.
await requireSuccess(['mise', 'install', javaTool, tlcTool], scratch);
const java = await requireSuccess(['mise', 'which', 'java', '--tool', javaTool], scratch);
const jar = path.join(await requireSuccess(['mise', 'where', tlcTool], scratch), 'tla2tools.jar');

async function modelCheck(mutated: boolean) {
  const name = mutated ? 'mutant' : 'baseline';
  const cfg = await fs.readFile(path.join(modelDir, `${entry.module}.cfg`), 'utf8');
  const config = path.join(modelDir, `${name}.cfg`);
  await fs.writeFile(config, mutated ? cfg.replace('Mutant = FALSE', 'Mutant = TRUE') : cfg);
  const result = await command(
    [
      java,
      '-XX:+UseParallelGC',
      '-cp',
      jar,
      'tlc2.TLC',
      '-workers',
      '1',
      '-fp',
      '0',
      '-metadir',
      path.join(scratch, `states-${name}`),
      '-config',
      config,
      entry.module,
    ],
    modelDir
  );
  await fs.writeFile(path.join(scratch, `tlc-${name}.out`), result.text);
  if (mutated) {
    if (result.code !== 12 || !result.text.includes(`Invariant ${entry.invariant} is violated`)) {
      throw new Error(`The model mutation did not violate ${entry.invariant}:\n${result.text}`);
    }
  } else if (result.code !== 0 || !result.text.includes('No error has been found')) {
    throw new Error(`Model check failed:\n${result.text}`);
  }
  const states = result.text.match(/(\d+) distinct states found/);
  process.stdout.write(
    `${key}: ${name} model ${mutated ? 'rejected' : 'passed'} (${states?.[1] ?? '?'} states)\n`
  );
  return { code: result.code, distinctStates: states ? Number(states[1]) : null };
}

const baseline = await modelCheck(false);
const copy = path.join(scratch, 'cli');
await fs.mkdir(copy);
for (const directory of ['src', 'test']) {
  await fs.cp(path.join(cli, directory), path.join(copy, directory), {
    recursive: true,
    filter: source => !['node_modules', '.venv', '__pycache__'].includes(path.basename(source)),
  });
}
await fs.symlink(path.join(cli, 'node_modules'), path.join(copy, 'node_modules'));
await fs.symlink(path.join(cli, 'skills-src'), path.join(copy, 'skills-src'));
await fs.copyFile(path.join(cli, 'package.json'), path.join(copy, 'package.json'));
await fs.writeFile(
  path.join(copy, 'tsconfig.json'),
  JSON.stringify({ extends: path.join(cli, 'tsconfig.json') })
);
// Retain the package's dependency aliases and isolation hooks. These selected suites need no
// fixture installs; omit the global setup that installs unrelated Python/TypeScript examples.
await fs.writeFile(
  path.join(copy, 'vitest.config.mts'),
  `
import base from ${JSON.stringify(path.join(cli, 'vitest.config.ts'))};
export default {
  ...base,
  root: ${JSON.stringify(copy)},
  resolve: { ...base.resolve, alias: { ...base.resolve.alias,
    src: ${JSON.stringify(path.join(copy, 'src'))},
    test: ${JSON.stringify(path.join(copy, 'test'))},
    '~': ${JSON.stringify(copy)},
    'effect-errors': ${JSON.stringify(path.join(copy, 'src/effect-errors'))}
  } },
  test: { ...base.test, globalSetup: [], includeSource: [],
    setupFiles: [${JSON.stringify(path.join(copy, 'test/__utils__/vitest.setup.ts'))}]
  }
};
`
);

// Existing Effect.flip-based tests fail before reaching expect() when a broken guard
// unexpectedly succeeds, or when it exposes a defect. In this scratch copy only, observe
// the complete Exit first so those outcomes become explicit contract assertion failures.
const failureAssertion = path.join(copy, 'test/formal-expect-failure.ts');
await fs.writeFile(
  failureAssertion,
  `
import { Cause, Effect, Exit } from 'effect';
import { expect } from 'vitest';
export const formalExpectFailure = self => Effect.flatMap(Effect.exit(self), exit => Effect.sync(() => {
  expect(Exit.isFailure(exit), 'The public failure contract must reject this invocation').toBe(true);
  if (Exit.isSuccess(exit)) throw new Error('Expected an assertion failure above');
  return Cause.squash(exit.cause);
}));
`
);
const contractTest = path.join(copy, entry.mutation.testFile);
const contractSource = await fs.readFile(contractTest, 'utf8');
if (contractSource.includes('Effect.flip')) {
  await fs.writeFile(
    contractTest,
    `import { formalExpectFailure } from ${JSON.stringify(failureAssertion)};\n` +
      contractSource.replaceAll('Effect.flip', 'formalExpectFailure')
  );
}

async function behavior(file: string, name: string | undefined, label: string, shouldFail = false) {
  const jsonFile = path.join(scratch, `${label}.json`);
  const result = await command(
    [
      'node',
      path.join(cli, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      path.join(copy, 'vitest.config.mts'),
      file,
      ...(name ? ['-t', name] : []),
      '--reporter=json',
      `--outputFile=${jsonFile}`,
    ],
    copy
  );
  await fs.writeFile(path.join(scratch, `${label}.out`), result.text);
  const report = JSON.parse(await fs.readFile(jsonFile, 'utf8'));
  const assertions = report.testResults.flatMap(
    (suite: { assertionResults: unknown[] }) => suite.assertionResults
  );
  const failed = assertions.filter((test: { status: string }) => test.status === 'failed');
  const timedOut = failed.some((test: { failureMessages: string[] }) =>
    test.failureMessages.some(message =>
      /timed out|timeout of|Failed to load|Cannot find module/i.test(message)
    )
  );
  const assertionFailures = failed.filter((test: { failureMessages: string[] }) =>
    test.failureMessages.some(message => message.includes('AssertionError'))
  );
  if (
    shouldFail
      ? result.code === 0 ||
        failed.length === 0 ||
        assertionFailures.length !== failed.length ||
        timedOut ||
        report.numRuntimeErrorTestSuites > 0
      : result.code !== 0 || report.numPassedTests === 0 || report.numFailedTests > 0
  ) {
    throw new Error(
      `Unexpected ${label} result:\n${result.text}\n${JSON.stringify(
        report.testResults.filter((suite: { status: string }) => suite.status === 'failed'),
        null,
        2
      ).slice(0, 10000)}`
    );
  }
  process.stdout.write(
    `${key}: ${label}: ${report.numPassedTests} passed, ${report.numFailedTests} failed\n`
  );
  return {
    file,
    name,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    failures: failed.map((test: { fullName: string; failureMessages: string[] }) => ({
      name: test.fullName,
      messages: test.failureMessages,
    })),
  };
}

const tests = [];
for (const [index, test] of entry.tests.entries()) {
  const name = 'name' in test && typeof test.name === 'string' ? test.name : undefined;
  tests.push(await behavior(test.file, name, `behavior-${index}`));
}

let negativeControl;
if (args.includes('--mutations')) {
  const brokenModel = await modelCheck(true);
  const mutation = entry.mutation;
  const file = path.join(copy, mutation.file);
  const original = await fs.readFile(file, 'utf8');
  if (original.split(mutation.before).length !== 2) {
    throw new Error(`Mutation target must occur exactly once: ${mutation.file}`);
  }
  await fs.writeFile(file, original.replace(mutation.before, mutation.after));
  let brokenCode;
  try {
    brokenCode = await behavior(mutation.testFile, mutation.testName, 'code-mutant', true);
  } finally {
    await fs.writeFile(file, original);
  }
  const restored = await behavior(mutation.testFile, mutation.testName, 'code-restored');
  negativeControl = { brokenModel, brokenCode, restored };
}

await fs.writeFile(
  path.join(scratch, 'receipt.json'),
  JSON.stringify(
    {
      subsystem: key,
      syncCommit: entry.syncCommit,
      testedHead: await requireSuccess(['git', 'rev-parse', 'HEAD'], repo),
      sources: entry.sources,
      invariant: entry.invariant,
      baseline,
      tests,
      negativeControl,
      models: Object.fromEntries(
        await Promise.all(
          (await fs.readdir(modelDir))
            .filter(file => /\.(tla|mjs)$/.test(file) || file === `${entry.module}.cfg`)
            .map(async file => [file, await hashFile(path.join(modelDir, file))])
        )
      ),
      verifierSha256: await hashFile(fileURLToPath(import.meta.url)),
      lockfileSha256: await hashFile(path.join(repo, 'pnpm-lock.yaml')),
      tools: {
        bun: Bun.version,
        node: await requireSuccess(['node', '--version'], scratch),
        java: javaTool,
        tlc: '1.7.4',
        tlcSha256: '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88',
      },
    },
    null,
    2
  ) + '\n'
);
process.stdout.write(
  `${key}: verified. Read the model with the pstack /statechart skill. Evidence: ${scratch}\n`
);
