import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'bun:test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect } from 'effect';
import ts from 'typescript6';
import {
  checkReferencePages,
  type CheckOptions,
  type CheckResult,
} from '../scripts/docs-reference-check/main';
import { withoutSuppressions } from '../scripts/docs-reference-check/policy';
import {
  compile,
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

  test('a session fragment is checked against the real session type', () => {
    expect(onPage(result, 'session.mdx')).toEqual([
      expect.objectContaining({
        rule: 'type',
        message: expect.stringContaining('missingSessionMember'),
      }),
    ]);
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
      { line: await lineOf(page, "'../src/index'"), rule: 'unresolved-module' },
      { line: await lineOf(page, "'#platform'"), rule: 'unresolved-module' },
      { line: await lineOf(page, '<reference path='), rule: 'reference-path' },
    ]);
  });

  test('signature and opted-out fences are skipped, counted and the reason listed', async () => {
    expect(result.checked).toBe(19);
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
      { line: await lineOf(page, '// @ts-ignore'), rule: 'suppression' },
      { line: await lineOf(page, 'composio.ignoredMember()'), rule: 'type' },
      { line: await lineOf(page, '// @ts-expect-error'), rule: 'suppression' },
      { line: await lineOf(page, 'composio.expectedErrorMember()'), rule: 'type' },
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

test(
  'global declarations and module augmentation cannot change another fence',
  async () => {
    const result = await check(`${FIXTURES}/augmentation`);
    expect(result.violations.map(({ rule }) => rule)).toEqual([
      'augmentation',
      'augmentation',
      'type',
    ]);
    expect(result.violations.at(-1)?.message).toContain('injectedMember');
  },
  TIMEOUT
);

describe('blanket suppression detection', () => {
  test('a block comment and a noCheck comment are rejected and blanked', () => {
    const source = '/* @ts-nocheck */\nconst a = 1;\n// @noCheck\nconst b = 2;';
    const { code, lines } = withoutSuppressions(source);
    expect(lines).toEqual([1, 3]);
    expect(code).toBe(' '.repeat(17) + '\nconst a = 1;\n' + ' '.repeat(11) + '\nconst b = 2;');
  });

  test('a string literal containing the marker is not a comment', () => {
    const source = "const s = '// @ts-nocheck';";
    expect(withoutSuppressions(source)).toEqual({
      code: source,
      lines: [],
      augmentations: [],
      referencePaths: [],
    });
  });

  test('a template literal with the marker after a substitution is not a comment', () => {
    const source = 'const s = `a ${1} // @ts-nocheck`;';
    expect(withoutSuppressions(source)).toEqual({
      code: source,
      lines: [],
      augmentations: [],
      referencePaths: [],
    });
  });
});

describe('module resolution', () => {
  test(
    'every public export has a canonical workspace target',
    () => {
      const exports = {
        '': 'src/index.ts',
        '/experimental': 'src/experimental/index.ts',
        '/platform': 'src/platform/node.ts',
        '/utils/json-schema': 'src/utils/json-schema.ts',
        '/utils/ssrf-guard': 'src/utils/ssrfGuard.node.ts',
        '/generated': 'pack/generated/index.d.ts',
      };
      const from = `${REPO}/.reference-check/snippet.ts`;
      const code = Object.keys(exports)
        .map(suffix => `import '@composio/core${suffix}';`)
        .join('\n');
      const { program, fileDiagnostics } = compile(
        new Map([[from, code]]),
        referenceCompilerOptions(),
        CORE
      );
      expect(fileDiagnostics.get(from)).toEqual([]);
      const imports = program.getSourceFile(from)?.statements.filter(ts.isImportDeclaration) ?? [];
      const checker = program.getTypeChecker();
      expect(
        imports.map(
          node =>
            checker.getSymbolAtLocation(node.moduleSpecifier)?.declarations?.[0]?.getSourceFile()
              .fileName
        )
      ).toEqual(Object.values(exports).map(target => `${CORE}/${target}`));
    },
    TIMEOUT
  );
});

const PACKAGE_MANIFEST = JSON.stringify({
  name: '@composio/core',
  exports: { '.': { types: './dist/index.d.mts' } },
});
const REFERENCE_EXAMPLE = [
  '```typescript',
  "import { Composio } from '@composio/core';",
  'new Composio().sourceOnly();',
  '```',
  '',
].join('\n');

async function withPackage(
  run: (root: string, put: (name: string, content: string) => Promise<void>) => Promise<void>
) {
  const temporary = await mkdtemp(join(tmpdir(), 'composio-reference-package-'));
  const root = join(temporary, 'core');
  const put = async (name: string, content: string) => {
    const file = join(root, name);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, content);
  };
  try {
    await put('package.json', PACKAGE_MANIFEST);
    await put('tsconfig.json', '{}');
    await put('../json-schema-to-zod/package.json', JSON.stringify({ exports: {} }));
    await put('pages/index.mdx', REFERENCE_EXAMPLE);
    await run(root, put);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

test(
  'a broken re-export in reachable SDK source fails even when the fence sees any',
  async () => {
    await withPackage(async (root, put) => {
      await put('src/index.ts', "export { Composio } from './missing';");
      const options = referenceCompilerOptions();
      const result = compile(
        new Map([[join(root, 'fence.ts'), REFERENCE_EXAMPLE.split('\n').slice(1, 3).join('\n')]]),
        { ...options, types: [] },
        root
      );
      expect(result.programDiagnostics.map(diagnostic => diagnostic.code)).toContain(2307);
    });
  },
  TIMEOUT
);

test(
  'a missing virtual root is a program failure',
  () => {
    const { programDiagnostics } = compile(
      new Map([[`${CORE}/discard/../virtual.ts`, 'export {};']]),
      referenceCompilerOptions(),
      CORE
    );
    expect(
      programDiagnostics.map(diagnostic =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      )
    ).toContainEqual(expect.stringContaining('Missing virtual root'));
  },
  TIMEOUT
);

test(
  'workspace resolution hides stale dist and refuses an installed fallback',
  async () => {
    await withPackage(async (root, put) => {
      await put('src/index.ts', 'export class Composio { sourceOnly() {} }');
      await put('dist/index.d.mts', 'export declare class Composio { staleOnly(): void }');
      await put(
        '../node_modules/@composio/core/package.json',
        JSON.stringify({
          name: '@composio/core',
          exports: { '.': { types: './index.d.ts' } },
        })
      );
      await put(
        '../node_modules/@composio/core/index.d.ts',
        'export declare class Composio { sourceOnly(): void }'
      );

      const file = join(root, 'fence.ts');
      const options = { ...referenceCompilerOptions(), types: [] };
      const files = new Map([[file, REFERENCE_EXAMPLE.split('\n').slice(1, 3).join('\n')]]);
      expect(
        createReferenceHost(options, root, new Map()).fileExists(join(root, 'dist/index.d.mts'))
      ).toBe(false);
      expect(compile(files, options, root).fileDiagnostics.get(file)).toEqual([]);

      await rm(join(root, 'src/index.ts'));
      expect(
        compile(files, options, root)
          .fileDiagnostics.get(file)
          ?.map(d => d.code)
      ).toEqual([2307]);
    });
  },
  TIMEOUT
);

test(
  'built validation checks package exports and the packaged reference bytes',
  async () => {
    await withPackage(async (root, put) => {
      await put('src/index.ts', 'export class Composio { sourceOnly() {} }');
      await put('dist/index.d.mts', 'export declare class Composio {}');
      const options = { packageDir: root, comparePackaged: true, compilerOptions: { types: [] } };
      const pages = join(root, 'pages');
      const packedPage = 'dist/docs/reference/sdk-reference/typescript/index.mdx';
      const missing = await check(pages, options);
      expect(missing.violations).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('Missing packaged reference'),
        })
      );

      await put(packedPage, REFERENCE_EXAMPLE + '\n');
      const changed = await check(pages, options);
      expect(changed.violations).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('Packaged reference differs'),
        })
      );

      await put(packedPage, REFERENCE_EXAMPLE);
      const incomplete = await check(pages, options);
      expect(incomplete.violations).toContainEqual(
        expect.objectContaining({
          rule: 'type',
          message: expect.stringContaining("Property 'sourceOnly' does not exist"),
        })
      );

      await put('dist/index.d.mts', 'export declare class Composio { sourceOnly(): void }');
      expect((await check(pages, options)).violations).toEqual([]);

      await put(packedPage, REFERENCE_EXAMPLE + '\n');
      const installed = { packageDir: root, compilerOptions: { types: [] } };
      expect((await check(pages, installed)).violations).toEqual([]);
      await put('dist/index.d.mts', 'export declare class Composio {}');
      expect((await check(pages, installed)).violations).toContainEqual(
        expect.objectContaining({
          rule: 'type',
          message: expect.stringContaining("Property 'sourceOnly' does not exist"),
        })
      );

      await put(packedPage, REFERENCE_EXAMPLE);
      await put('dist/index.d.mts', "export { Composio } from './missing';");
      expect((await check(pages, options)).violations).toContainEqual(
        expect.objectContaining({
          rule: 'program',
          message: expect.stringMatching(/dist\/index\.d\.mts.*Cannot find module '\.\/missing'/),
        })
      );
      await put('package.json', JSON.stringify({ name: '@composio/core', exports: {} }));
      expect((await check(pages, options)).violations).toContainEqual(
        expect.objectContaining({
          rule: 'unresolved-module',
          message: expect.stringContaining('@composio/core'),
        })
      );
    });
  },
  TIMEOUT
);

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

describe('the SDK reference drift workflow', () => {
  type Step = { name?: string; id?: string; if?: string; run?: string };
  type Workflow = {
    on: { push: Record<string, unknown>; pull_request: Record<string, unknown> };
    jobs: { drift: { name: string; steps: Step[] } };
  };
  const workflow = async () =>
    Bun.YAML.parse(
      await Bun.file(`${REPO}/.github/workflows/docs-sdk-reference-drift.yml`).text()
    ) as Workflow;
  const scopeStep = (steps: Step[]) => steps.find(step => step.id === 'scope');

  test('reports on every pull request and uses one scope step for push and pull_request', async () => {
    const { on, jobs } = await workflow();
    expect(jobs.drift.name).toBe('SDK reference drift');
    // A path filter would leave the required check pending forever on unrelated PRs.
    expect(on.pull_request).not.toHaveProperty('paths');
    expect(on.pull_request).not.toHaveProperty('paths-ignore');
    expect(on.push).not.toHaveProperty('paths');
  });

  test('skips every step after the scope decision when no input changed', async () => {
    const { jobs } = await workflow();
    const steps = jobs.drift.steps;
    const after = steps.slice(steps.findIndex(step => step.id === 'scope') + 1);
    expect(after.length).toBeGreaterThan(0);
    for (const step of after) expect(step.if).toBe("steps.scope.outputs.affected == 'true'");
  });

  test(
    'the scope step marks a PR affected only when it touches a reference input',
    async () => {
      const { jobs } = await workflow();
      const run = scopeStep(jobs.drift.steps)?.run ?? '';
      const repo = await mkdtemp(join(tmpdir(), 'drift-scope-'));
      const git = (...args: string[]) =>
        Bun.spawnSync(['git', '-C', repo, ...args], { stderr: 'pipe' });
      const write = async (path: string, text: string) => {
        await mkdir(join(repo, path, '..'), { recursive: true });
        await writeFile(join(repo, path), text);
      };
      const decide = async (path: string, eventName: 'pull_request' | 'push' = 'pull_request') => {
        git('checkout', '-q', '-B', 'base', 'main');
        git('checkout', '-q', '-B', 'pr');
        await write(path, String(Math.random()));
        git('add', '-A');
        git('commit', '-q', '-m', 'change');
        const base = git('rev-parse', 'main').stdout.toString().trim();
        const output = `${repo}.output`;
        await writeFile(output, '');
        // The workflow fetches the base from origin; here the base commit is already local.
        const script = run.replace(/git fetch --no-tags --depth=1 origin "\$BASE_SHA"/, 'true');
        const result = Bun.spawnSync(['bash', '-c', script], {
          cwd: repo,
          env: {
            ...process.env,
            EVENT_NAME: eventName,
            PR_BASE_SHA: eventName === 'pull_request' ? base : '',
            PUSH_BEFORE_SHA: eventName === 'push' ? base : '',
            GITHUB_OUTPUT: output,
          },
        });
        expect(result.exitCode).toBe(0);
        return (await Bun.file(output).text()).trim();
      };
      try {
        git('init', '-q', '-b', 'main');
        git('config', 'user.email', 'test@example.com');
        git('config', 'user.name', 'test');
        git('config', 'commit.gpgsign', 'false');
        await write('README.md', 'base');
        git('add', '-A');
        git('commit', '-q', '-m', 'base');
        expect(await decide('ts/packages/core/src/models/Tools.ts')).toBe('affected=true');
        expect(await decide('docs/content/reference/sdk-reference/typescript/tools.mdx')).toBe(
          'affected=true'
        );
        expect(await decide('package.json')).toBe('affected=true');
        expect(await decide('ts/packages/cli/src/index.ts')).toBe('affected=false');
        expect(await decide('docs/content/docs/quickstart.mdx')).toBe('affected=false');
        // Only the root manifest is an input, not every package.json.
        expect(await decide('ts/packages/cli/package.json')).toBe('affected=false');
        expect(await decide('ts/packages/core/src/models/Tools.ts', 'push')).toBe('affected=true');
        expect(await decide('ts/packages/cli/src/index.ts', 'push')).toBe('affected=false');
      } finally {
        await rm(`${repo}.output`, { force: true });
        await rm(repo, { recursive: true, force: true });
      }
    },
    TIMEOUT
  );
});
