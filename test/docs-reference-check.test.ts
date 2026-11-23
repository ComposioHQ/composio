import { beforeAll, describe, expect, test } from 'bun:test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect } from 'effect';
import ts from 'typescript6';
import {
  checkReferencePages,
  type CheckOptions,
  type CheckResult,
} from '../scripts/docs-reference-check/main';
import { withoutBlanketSuppressions } from '../scripts/docs-reference-check/policy';
import {
  createReferenceHost,
  referenceCompilerOptions,
} from '../scripts/docs-reference-check/program';

const REPO = import.meta.dir.replace(/\/test$/, '');
const CORE = `${REPO}/ts/packages/core`;
const FIXTURES = 'test/fixtures/docs-reference-check';
const PAGES = `${FIXTURES}/pages`;
const REPORT = `${FIXTURES}/report`;
const NO_FENCES = `${FIXTURES}/no-fences`;
const TIMEOUT = 120_000;

const check = (directory: string, options?: CheckOptions) =>
  Effect.runPromise(
    checkReferencePages(directory, options).pipe(Effect.provide(BunServices.layer))
  );

/** The 1-based line of the nth occurrence of `needle` in a fixture page, read from the fixture itself. */
const lineOf = async (page: string, needle: string, occurrence = 1) => {
  const lines = (await Bun.file(`${REPO}/${page}`).text()).split('\n');
  let seen = 0;
  const index = lines.findIndex(line => line.includes(needle) && ++seen === occurrence);
  if (index < 0) throw new Error(`${needle} not found in ${page}`);
  return index + 1;
};

const onPage = (result: CheckResult, page: string) =>
  result.violations.filter(violation => violation.page === `${PAGES}/${page}`);

describe('reference checker over fixture pages', () => {
  let result: CheckResult;
  beforeAll(async () => {
    result = await check(PAGES);
  }, TIMEOUT);

  test('a Usage block with its import, an experimental import and a composio fragment pass', () => {
    expect(onPage(result, 'usage-valid.mdx')).toEqual([]);
  });

  test('a session fragment passes on the session page', () => {
    expect(onPage(result, 'session.mdx')).toEqual([]);
  });

  test('a property the class lacks fails and is named', async () => {
    const violations = onPage(result, 'webhook-endpoints.mdx');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      line: await lineOf(`${PAGES}/webhook-endpoints.mdx`, 'composio.webhookEndpoints.list()'),
      className: 'WebhookEndpoints',
      section: 'Usage',
      method: null,
      rule: 'type',
    });
    expect(violations[0]?.message).toContain("Property 'webhookEndpoints' does not exist");
  });

  test('a missing import fails on the import, and adding it still fails on the property', async () => {
    const page = `${PAGES}/remote-file.mdx`;
    const violations = onPage(result, 'remote-file.mdx');
    expect(violations.map(({ line, rule }) => ({ line, rule }))).toEqual([
      { line: await lineOf(page, 'new Composio', 1), rule: 'unresolved-name' },
      { line: await lineOf(page, 'composio.remoteFile.list()', 2), rule: 'type' },
    ]);
    expect(violations[0]?.message).toContain("Cannot find name 'Composio'");
    expect(violations[1]?.message).toContain("Property 'remoteFile' does not exist");
  });

  test('an undeclared userId fails, and session is not declared outside the session pages', async () => {
    const page = `${PAGES}/fragments.mdx`;
    const violations = onPage(result, 'fragments.mdx');
    expect(violations.map(({ line, rule, method }) => ({ line, rule, method }))).toEqual([
      { line: await lineOf(page, 'userId'), rule: 'unresolved-name', method: 'get()' },
      { line: await lineOf(page, 'session.tools()'), rule: 'unresolved-name', method: 'tools()' },
    ]);
    expect(violations[0]?.message).toContain("Cannot find name 'userId'");
    expect(violations[1]?.message).toContain("Cannot find name 'session'");
  });

  test('imports of modules that do not exist fail', async () => {
    const page = `${PAGES}/modules.mdx`;
    const violations = onPage(result, 'modules.mdx');
    expect(violations.map(({ line, rule }) => ({ line, rule }))).toEqual([
      { line: await lineOf(page, "'@composio/core/not-a-subpath'"), rule: 'unresolved-module' },
      {
        line: await lineOf(page, "'composio-reference-check-missing-package'"),
        rule: 'unresolved-module',
      },
    ]);
  });

  test('signature and opted-out fences are skipped, counted and the reason listed', async () => {
    expect(result.checked).toBe(13);
    expect(result.signatures).toBe(1);
    expect(result.optedOut).toEqual([
      {
        page: `${PAGES}/usage-valid.mdx`,
        line: await lineOf(`${PAGES}/usage-valid.mdx`, 'nocheck='),
        className: 'Tools',
        section: 'Methods',
        method: 'handleWebhook()',
        reason: 'Express handler types are not installed',
      },
    ]);
  });

  test('an empty opt-out reason and an unknown fence option each fail', async () => {
    const page = `${PAGES}/options.mdx`;
    const violations = onPage(result, 'options.mdx');
    expect(violations.map(({ line, rule }) => ({ line, rule }))).toEqual([
      { line: await lineOf(page, 'nocheck=""'), rule: 'fence-option' },
      { line: await lineOf(page, 'frobnicate'), rule: 'fence-option' },
    ]);
    expect(violations[0]?.message).toContain('nocheck');
    expect(violations[1]?.message).toContain('frobnicate');
  });

  test('blanket suppression comments are rejected and the fence is still checked', async () => {
    const page = `${PAGES}/suppressions.mdx`;
    const violations = onPage(result, 'suppressions.mdx');
    expect(violations.map(({ line, rule }) => ({ line, rule }))).toEqual([
      { line: await lineOf(page, '// @ts-nocheck'), rule: 'suppression' },
      { line: await lineOf(page, "const count: number = 'not a number'"), rule: 'type' },
      { line: await lineOf(page, '// @noErrors'), rule: 'suppression' },
      { line: await lineOf(page, 'const label: string = 42'), rule: 'type' },
    ]);
  });

  test('malformed MDX is a page violation and the other pages are still checked', async () => {
    const violations = onPage(result, 'malformed.mdx');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      line: await lineOf(`${PAGES}/malformed.mdx`, '<Callout'),
      rule: 'parse',
      className: null,
      method: null,
    });
    expect(onPage(result, 'webhook-endpoints.mdx')).toHaveLength(1);
  });
});

describe('blanket suppression detection', () => {
  test('a block comment and a noCheck comment are rejected and blanked', () => {
    const source = '/* @ts-nocheck */\nconst a = 1;\n// @noCheck\nconst b = 2;';
    const { code, lines } = withoutBlanketSuppressions(source);
    expect(lines).toEqual([1, 3]);
    expect(code).toBe(' '.repeat(17) + '\nconst a = 1;\n' + ' '.repeat(11) + '\nconst b = 2;');
  });

  test('a string literal containing the marker is not a comment', () => {
    const source = "const s = '// @ts-nocheck';";
    expect(withoutBlanketSuppressions(source)).toEqual({ code: source, lines: [] });
  });

  test('a template literal with the marker after a substitution is not a comment', () => {
    const source = 'const s = `a ${1} // @ts-nocheck`;';
    expect(withoutBlanketSuppressions(source)).toEqual({ code: source, lines: [] });
  });
});

describe('module resolution', () => {
  const options = referenceCompilerOptions(CORE);
  const host = createReferenceHost(options, CORE, new Map());
  const from = `${CORE}/snippet.ts`;
  const resolve = (specifier: string) =>
    ts.resolveModuleName(specifier, from, options, host).resolvedModule?.resolvedFileName;

  test('@composio/core and its experimental subpath resolve to workspace source with dist hidden', () => {
    expect(host.fileExists(`${CORE}/dist/index.d.mts`)).toBe(false);
    expect(resolve('@composio/core')).toBe(`${CORE}/src/index.ts`);
    expect(resolve('@composio/core/experimental')).toBe(`${CORE}/src/experimental/index.ts`);
  });
});

test(
  'a program-level diagnostic fails the run',
  async () => {
    const result = await check(REPORT, {
      compilerOptions: { types: ['composio-reference-check-missing-types'] },
    });
    const program = result.violations.filter(violation => violation.rule === 'program');
    expect(program).toHaveLength(1);
    expect(program[0]).toMatchObject({ page: null, line: null });
    expect(program[0]?.message).toContain('composio-reference-check-missing-types');
  },
  TIMEOUT
);

test(
  'a run that checks no fences fails and names the directory',
  async () => {
    const result = await check(NO_FENCES);
    expect(result.checked).toBe(0);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ page: null, line: null, rule: 'program' });
    expect(result.violations[0]?.message).toContain(NO_FENCES);
  },
  TIMEOUT
);

test(
  'violations name page, line, class, method and message, in text and in --json',
  async () => {
    const page = `${REPORT}/webhook-endpoints.mdx`;
    const run = async (...args: string[]) => {
      const child = Bun.spawn(['bun', 'scripts/docs-reference-check/main.ts', ...args, REPORT], {
        cwd: REPO,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stdout, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        child.exited,
      ]);
      return { stdout, exitCode };
    };
    const [text, json] = await Promise.all([run(), run('--json')]);
    const line = await lineOf(page, 'composio.webhookEndpoints.list()');
    const reasonLine = await lineOf(page, 'nocheck=');
    const reason = 'Express handler types are not installed';

    expect(JSON.parse(json.stdout)).toEqual({
      checked: 1,
      signatures: 0,
      optedOut: [
        {
          page,
          line: reasonLine,
          className: 'WebhookEndpoints',
          section: 'Methods',
          method: 'verify()',
          reason,
        },
      ],
      violations: [
        {
          page,
          line,
          className: 'WebhookEndpoints',
          section: 'Methods',
          method: 'list()',
          rule: 'type',
          message: expect.stringContaining("Property 'webhookEndpoints' does not exist"),
        },
      ],
    });
    expect(json.exitCode).not.toBe(0);

    expect(text.exitCode).not.toBe(0);
    expect(text.stdout).toContain(`${page}:${line} WebhookEndpoints > list()`);
    expect(text.stdout).toContain("Property 'webhookEndpoints' does not exist");
    expect(text.stdout).toContain(
      'Checked 1 fence(s), skipped 0 signature fence(s), opted out 1 fence(s).'
    );
    expect(text.stdout).toContain(`${page}:${reasonLine} ${reason}`);
  },
  TIMEOUT
);
