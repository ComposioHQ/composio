/**
 * Black-box contract of `composio run`: what a caller sees on stdout, stderr and the exit status
 * when the CLI runs a script. Each case spawns the CLI from source in an isolated home, so the
 * suite pins behavior that does not depend on how the script is executed.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI_ENTRY = path.resolve(import.meta.dirname, '../../../../src/bin.ts');

/**
 * The CLI under test: from source by default, or a compiled executable named by
 * `COMPOSIO_RUN_CONTRACT_CLI`, so the same contract can be checked against a release build.
 */
const CLI_COMMAND: ReadonlyArray<string> = process.env.COMPOSIO_RUN_CONTRACT_CLI
  ? [process.env.COMPOSIO_RUN_CONTRACT_CLI]
  : ['bun', CLI_ENTRY];

type RunResult = { readonly code: number | null; readonly stdout: string; readonly stderr: string };

let home = '';

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-contract-'));
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

/** The caller's environment without any Composio setting or credential, plus `env`. */
const isolatedEnv = (env: Record<string, string>) => ({
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith('COMPOSIO_') && !name.startsWith('BUN_')
    )
  ),
  HOME: home,
  COMPOSIO_CACHE_DIR: path.join(home, '.composio'),
  COMPOSIO_DISABLE_TELEMETRY: 'true',
  CI: 'true',
  NO_COLOR: '1',
  ...env,
});

const runCli = (
  args: ReadonlyArray<string>,
  options: { readonly cwd?: string; readonly env?: Record<string, string> } = {}
): Promise<RunResult> =>
  new Promise((resolve, reject) => {
    const [command, ...prefix] = CLI_COMMAND;
    const child = spawn(command!, [...prefix, ...args], {
      cwd: options.cwd ?? home,
      env: isolatedEnv(options.env ?? {}),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });

const run = (code: string, ...rest: ReadonlyArray<string>) => runCli(['run', code, ...rest]);

/** stderr without the `RUN_LOG_FILE=` line every run prints. */
const diagnostics = (result: RunResult) =>
  result.stderr
    .split('\n')
    .filter(line => !line.startsWith('RUN_LOG_FILE='))
    .join('\n')
    .trim();

const writeScript = (name: string, source: string) => {
  const directory = fs.mkdtempSync(path.join(home, 'script-'));
  const scriptPath = path.join(directory, name);
  fs.writeFileSync(scriptPath, source, 'utf8');
  return { directory, scriptPath };
};

describe.concurrent('composio run contract', { timeout: 60_000 }, () => {
  describe('output', () => {
    it('writes console.log to stdout and exits 0', async () => {
      const result = await run('console.log("hi")');
      expect(result).toMatchObject({ code: 0, stdout: 'hi\n' });
    });

    it('writes console.error and console.warn to stderr, never stdout', async () => {
      const result = await run(
        'console.error("to-stderr"); console.warn("warned"); console.log("to-stdout")'
      );
      expect(result.code).toBe(0);
      expect(result.stdout).toBe('to-stdout\n');
      expect(result.stderr).toContain('to-stderr');
      expect(result.stderr).toContain('warned');
    });

    it('formats several console.log arguments on one line, space-separated', async () => {
      const result = await run('console.log("a", 1, true, null)');
      expect(result.stdout).toBe('a 1 true null\n');
    });

    it('formats objects readably', async () => {
      const result = await run('console.log({ login: "octocat", repos: [1, 2] })');
      expect(result.stdout).toContain('login');
      expect(result.stdout).toContain('octocat');
      expect(result.stdout).not.toContain('[object Object]');
    });

    it('prints the value of a trailing expression', async () => {
      expect((await run('const value = 20; value + 22')).stdout).toBe('42\n');
    });

    it('prints a trailing awaited expression', async () => {
      expect((await run('await Promise.resolve("done")')).stdout).toBe('done\n');
    });

    it('prints nothing for a trailing expression that is undefined', async () => {
      const result = await run('const value = undefined; value');
      expect(result).toMatchObject({ code: 0, stdout: '' });
    });

    it('flushes every line of a large output before exiting', async () => {
      const result = await run('for (let i = 0; i < 20000; i++) console.log(i)');
      const lines = result.stdout.trimEnd().split('\n');
      expect(result.code).toBe(0);
      expect(lines).toHaveLength(20000);
      expect(lines.at(-1)).toBe('19999');
    });

    it('announces the run log on stderr', async () => {
      const result = await run('1');
      expect(result.stderr).toMatch(/^RUN_LOG_FILE=.*run\.log$/m);
    });
  });

  describe('exit status', () => {
    it('exits with the code given to process.exit', async () => {
      const result = await run('console.log("before"); process.exit(7); console.log("after")');
      expect(result).toMatchObject({ code: 7, stdout: 'before\n' });
    });

    it('exits through a surrounding try/catch', async () => {
      const result = await run('try { process.exit(3) } catch { console.log("caught") }');
      expect(result).toMatchObject({ code: 3, stdout: '' });
    });

    it('exits 0 for process.exit()', async () => {
      expect((await run('process.exit()')).code).toBe(0);
    });

    it('exits with process.exitCode once the script ends', async () => {
      const result = await run('process.exitCode = 4; console.log("still runs")');
      expect(result).toMatchObject({ code: 4, stdout: 'still runs\n' });
    });

    it('exits 1 and reports an uncaught error on stderr', async () => {
      const result = await run('throw new Error("boom")');
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(diagnostics(result)).toContain('boom');
    });

    it('exits 1 for an error thrown after an await', async () => {
      const result = await run('await Promise.resolve(); throw new TypeError("late boom")');
      expect(result.code).toBe(1);
      expect(diagnostics(result)).toContain('late boom');
    });

    it('exits 1 and reports an unhandled rejection', async () => {
      const result = await run('Promise.reject(new Error("unhandled")); console.log("after")');
      expect(result.code).toBe(1);
      expect(diagnostics(result)).toContain('unhandled');
    });

    it('exits 1 for a syntax error and runs nothing', async () => {
      const result = await run('console.log("ran"); const = ;');
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(diagnostics(result)).not.toBe('');
    });

    it('exits 1 with a usage message when no code or file is given', async () => {
      const result = await runCli(['run']);
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Provide inline code or use --file to run a script file.');
    });

    it('exits non-zero when --file names a missing file', async () => {
      const result = await runCli(['run', '--file', path.join(home, 'missing.ts')]);
      expect(result.code).not.toBe(0);
      expect(result.stdout).toBe('');
    });
  });

  describe('language', () => {
    it('accepts TypeScript annotations in inline code', async () => {
      expect(
        (await run('const n: number = 5; const f = (x: number): number => x * 2; f(n)')).stdout
      ).toBe('10\n');
    });

    it('supports top-level await and Promise.all', async () => {
      const result = await run(
        'const [a, b] = await Promise.all([Promise.resolve(1), Promise.resolve(2)]); a + b'
      );
      expect(result.stdout).toBe('3\n');
    });

    it('supports classes, destructuring, spread, and generators', async () => {
      const result = await run(
        'class A { constructor(x) { this.x = x } get double() { return this.x * 2 } }; function* g() { yield 1; yield 2 }; const { x, ...rest } = { x: new A(2).double, y: 1 }; [x, rest.y, ...g()].join(",")'
      );
      expect(result.stdout).toBe('4,1,1,2\n');
    });

    it('awaits setTimeout', async () => {
      const result = await run(
        'await new Promise(resolve => setTimeout(resolve, 10)); console.log("slept")'
      );
      expect(result.stdout).toBe('slept\n');
    });

    it('runs a timer callback scheduled before the script ends', async () => {
      const result = await run(
        'setTimeout(() => console.log("timer fired"), 20); console.log("script ended")'
      );
      expect(result).toMatchObject({ code: 0, stdout: 'script ended\ntimer fired\n' });
    });

    it('does not run a cleared timer', async () => {
      const result = await run(
        'const id = setTimeout(() => console.log("never"), 10); clearTimeout(id)'
      );
      expect(result).toMatchObject({ code: 0, stdout: '' });
    });

    it('stops an interval the script clears', async () => {
      const result = await run(
        'let n = 0; const id = setInterval(() => { n++; console.log(n); if (n === 3) clearInterval(id) }, 5)'
      );
      expect(result).toMatchObject({ code: 0, stdout: '1\n2\n3\n' });
    });
  });

  describe('arguments and environment', () => {
    it('passes arguments after -- to inline code', async () => {
      const result = await run(
        'console.log(JSON.stringify(process.argv.slice(1)))',
        '--',
        '--repo',
        'acme/app'
      );
      expect(JSON.parse(result.stdout)).toEqual(['--repo', 'acme/app']);
    });

    it('passes arguments after -- to a script file, after its path', async () => {
      const { scriptPath } = writeScript(
        'args.ts',
        'console.log(JSON.stringify(process.argv.slice(2)))\n'
      );
      const result = await runCli(['run', '--file', scriptPath, '--', '--repo', 'acme/app']);
      expect(JSON.parse(result.stdout)).toEqual(['--repo', 'acme/app']);
    });

    it("reads the caller's environment variables", async () => {
      const result = await runCli(['run', 'console.log(process.env.RUN_CONTRACT_VALUE)'], {
        env: { RUN_CONTRACT_VALUE: 'from-env' },
      });
      expect(result.stdout).toBe('from-env\n');
    });
  });

  describe('--file', () => {
    it('runs a TypeScript file and prints its trailing expression', async () => {
      const { scriptPath } = writeScript(
        'typed.ts',
        'type Pair = { readonly a: number; readonly b: number };\nconst pair: Pair = { a: 1, b: 2 };\npair.a + pair.b;\n'
      );
      const result = await runCli(['run', '--file', scriptPath]);
      expect(result).toMatchObject({ code: 0, stdout: '3\n' });
    });

    it('resolves a relative path against the working directory', async () => {
      const { directory } = writeScript('relative.js', 'console.log("relative ok")\n');
      const result = await runCli(['run', '--file', './relative.js'], { cwd: directory });
      expect(result.stdout).toBe('relative ok\n');
    });

    it('leaves no files next to the script', async () => {
      const { directory, scriptPath } = writeScript('clean.ts', 'console.log(1)\n');
      await runCli(['run', '--file', scriptPath]);
      expect(fs.readdirSync(directory)).toEqual(['clean.ts']);
    });

    it('reports an uncaught error with the source line that threw', async () => {
      const { scriptPath } = writeScript(
        'throws.ts',
        'const a = 1;\nconst b = 2;\nthrow new Error("line three");\n'
      );
      const result = await runCli(['run', '--file', scriptPath]);
      expect(result.code).toBe(1);
      expect(diagnostics(result)).toContain('line three');
      expect(diagnostics(result)).toContain('throw new Error("line three")');
    });
  });

  describe('injected helpers', () => {
    it('injects execute, search and proxy as functions', async () => {
      const result = await run('[typeof execute, typeof search, typeof proxy].join(",")');
      expect(result.stdout).toBe('function,function,function\n');
    });

    it('injects z for schema validation', async () => {
      const result = await run(
        'const User = z.object({ login: z.string(), id: z.number().optional() }); JSON.stringify([User.parse({ login: "octocat" }), User.safeParse({ login: 1 }).success])'
      );
      expect(result.stdout).toBe('[{"login":"octocat"},false]\n');
    });

    it('preserves object parsing and nested issues after z.config and z.compile', async () => {
      const result = await run(`
        z.config({ jitless: false });
        const Profile = z.object({
          id: z.coerce.number(),
          name: z.string().min(2),
          active: z.boolean().default(true),
        }).catchall(z.number());
        const User = z.compile(z.object({ profile: Profile, note: z.string().optional() }));
        const valid = User.parse({ profile: { id: "42", name: "octocat", score: 3 } });
        const invalid = User.safeParse({ profile: { id: 42, name: "x", score: "high" } });
        JSON.stringify({ valid, issues: invalid.error.issues });
      `);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        valid: { profile: { id: 42, name: 'octocat', active: true, score: 3 } },
        issues: [
          {
            origin: 'string',
            code: 'too_small',
            minimum: 2,
            inclusive: true,
            path: ['profile', 'name'],
            message: 'Too small: expected string to have >=2 characters',
          },
          {
            expected: 'number',
            code: 'invalid_type',
            path: ['profile', 'score'],
            message: 'Invalid input: expected number, received string',
          },
        ],
      });
    });

    it('throws a ZodError-like error from parse', async () => {
      const result = await run(
        'try { z.string().parse(1) } catch (error) { console.log(error.message.includes("expected")) }'
      );
      expect(result.stdout).toBe('true\n');
    });

    it('rejects the removed experimental_subAgent helper with an explanation', async () => {
      const result = await run(
        'await experimental_subAgent().catch(error => console.log(error.message))'
      );
      expect(result.stdout).toContain('experimental_subAgent() was removed');
    });

    it('fails proxy() without a login, with a message the script can catch', async () => {
      const result = await run('await proxy("github").catch(error => console.log(error.message))');
      expect(result.stdout).toContain('proxy() requires an authenticated Composio user session.');
    });

    it('rejects proxy() with an empty toolkit', async () => {
      const result = await run('await proxy("  ").catch(error => console.log(error.message))');
      expect(result.stdout).toContain('proxy() requires a non-empty toolkit string.');
    });
  });
});
