import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareRunProgram } from 'src/commands/run-source-transforms';
import {
  runScriptProgram,
  type RunScriptHelpers,
  type RunScriptIo,
} from 'src/services/run-script/engine';

type Captured = { stdout: string; stderr: string };

const captureIo = (tty = false): RunScriptIo & { readonly captured: Captured } => {
  const captured: Captured = { stdout: '', stderr: '' };
  return {
    captured,
    stdout: chunk => {
      captured.stdout += chunk;
    },
    stderr: chunk => {
      captured.stderr += chunk;
    },
    stdoutIsTTY: tty,
    stderrIsTTY: tty,
  };
};

const unusedHelper = () => Promise.reject(new Error('not expected in this test'));

const fakeHelpers = (overrides: Partial<RunScriptHelpers> = {}): RunScriptHelpers => ({
  execute: unusedHelper,
  search: unusedHelper,
  proxy: unusedHelper,
  proxySchema: { type: 'function' },
  removedSubAgentMessage: 'experimental_subAgent() was removed.',
  runContext: { outputDir: '/tmp/out', logFilePath: '/tmp/out/run.log' },
  consumerContext: { consumerUserId: 'user-1' },
  ...overrides,
});

/** Runs `source` as `composio run` would, and returns its exit code and output. */
const runScript = async (
  source: string,
  options: {
    readonly helpers?: Partial<RunScriptHelpers>;
    readonly argv?: ReadonlyArray<string>;
    readonly env?: Record<string, string>;
    readonly fileName?: string;
    readonly signal?: AbortSignal;
    readonly tty?: boolean;
  } = {}
) => {
  const io = captureIo(options.tty);
  const { exitCode } = await runScriptProgram({
    program: prepareRunProgram(source, options.fileName),
    source,
    displayName: options.fileName ?? '[eval]',
    argv: options.argv ?? ['/usr/local/bin/composio'],
    env: options.env ?? {},
    cwd: '/work',
    helpers: fakeHelpers(options.helpers),
    io,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { exitCode, ...io.captured };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runScriptProgram', () => {
  describe('output', () => {
    it('[Given] console methods [Then] log, info, and debug go to stdout; warn and error to stderr', async () => {
      const result = await runScript(
        'console.log("log"); console.info("info"); console.debug("debug"); console.warn("warn"); console.error("error")'
      );
      expect(result).toEqual({
        exitCode: 0,
        stdout: 'log\ninfo\ndebug\n',
        stderr: 'warn\nerror\n',
      });
    });

    it('[Given] format specifiers and values [Then] they print as Node and Bun print them', async () => {
      const result = await runScript(
        'console.log("%s has %d repos", "octocat", 8, new Map([["a", 1]]), new Set([1]), [1, "two"], new Date(0))'
      );
      expect(result.stdout).toBe(
        "octocat has 8 repos Map(1) { 'a' => 1 } Set(1) { 1 } [ 1, 'two' ] 1970-01-01T00:00:00.000Z\n"
      );
    });

    it('[Given] a terminal [Then] objects are colored, and plain text is not', async () => {
      const result = await runScript('console.log("plain"); console.log({ a: 1 })', { tty: true });
      expect(result.stdout).toContain('plain\n');
      expect(result.stdout).toContain('\u001b[33m1\u001b[39m');
    });

    it('[Given] process.stdout.write [Then] it writes without adding a newline', async () => {
      const result = await runScript(
        'process.stdout.write("a"); process.stdout.write("b"); process.stderr.write("c");\nundefined'
      );
      expect(result).toMatchObject({ stdout: 'ab', stderr: 'c' });
    });

    it('[Given] a trailing expression [Then] its value is printed once the script ends', async () => {
      expect((await runScript('const user = { login: "octocat" };\nuser')).stdout).toBe(
        "{ login: 'octocat' }\n"
      );
    });

    it('[Given] a trailing undefined or a declaration [Then] nothing is printed', async () => {
      expect((await runScript('console.log("x")')).stdout).toBe('x\n');
      expect((await runScript('const a = 1')).stdout).toBe('');
    });

    it('[Given] a top-level return [Then] the returned value is printed', async () => {
      expect((await runScript('if (true) return "early";\nconsole.log("late")')).stdout).toBe(
        'early\n'
      );
    });
  });

  describe('exit status', () => {
    it('[Given] an uncaught error [Then] it exits 1 and points at the line and column that threw', async () => {
      const result = await runScript('const a = 1;\n  null.missing');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        [
          '2 |   null.missing',
          '      ^',
          "error: TypeError: Cannot read properties of null (reading 'missing').",
          '    at [eval]:2:3',
          '',
        ].join('\n')
      );
    });

    it('[Given] an error on the first line [Then] the column ignores the injected prelude', async () => {
      const result = await runScript('throw new Error("first line")');
      expect(result.stderr).toContain('error: first line\n    at [eval]:1:');
      expect(result.stderr).toMatch(/at \[eval\]:1:([1-9]|1\d)$/m);
    });

    it('[Given] a TypeScript file that throws [Then] the location is mapped back through types it removed', async () => {
      const source =
        'interface User {\n  login: string;\n}\n\nconst user: User = { login: "a" };\nthrow new Error(user.login);\n';
      const result = await runScript(source, { fileName: '/work/script.ts' });
      expect(result.stderr).toContain('6 | throw new Error(user.login);');
      expect(result.stderr).toContain('at /work/script.ts:6:');
    });

    it('[Given] a TypeScript file that throws [Then] the error points past the erased type annotation', async () => {
      const source = 'const value: { missing: string } = null; if (value.missing) {}';
      const result = await runScript(source, { fileName: '/work/script.ts' });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(`1 | ${source}`);
      expect(result.stderr).toContain('at /work/script.ts:1:46\n');
    });

    it('[Given] a thrown non-Error [Then] its value is reported', async () => {
      const result = await runScript('throw "plain string"');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('error: plain string');
    });

    it('[Given] an unhandled rejection [Then] the script finishes and then exits 1', async () => {
      const result = await runScript(
        'Promise.reject(new Error("nobody caught me")); console.log("after")'
      );
      expect(result).toMatchObject({ exitCode: 1, stdout: 'after\n' });
      expect(result.stderr).toContain('nobody caught me');
    });

    it('[Given] process.exit in a try block [Then] it exits and nothing after it reaches the output', async () => {
      const result = await runScript(
        'try { process.exit(4) } catch { console.log("caught") } finally { console.error("finally") }\nconsole.log("after")'
      );
      expect(result).toEqual({ exitCode: 4, stdout: '', stderr: '' });
    });

    it('[Given] process.exit in a timer callback [Then] the run ends with that code', async () => {
      const result = await runScript(
        'setTimeout(() => process.exit(9), 5); console.log("scheduled")'
      );
      expect(result).toMatchObject({ exitCode: 9, stdout: 'scheduled\n' });
    });

    it('[Given] process.exit() after setting process.exitCode [Then] it exits with exitCode', async () => {
      expect((await runScript('process.exitCode = 6; process.exit()')).exitCode).toBe(6);
    });

    it('[Given] a non-numeric exit code [Then] it exits 0', async () => {
      expect((await runScript('process.exit("nope")')).exitCode).toBe(0);
    });

    it('[Given] a syntax error [Then] nothing runs and it exits 1', async () => {
      const result = await runScript('console.log("ran");\nconst = 1;');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('2 | const = 1;');
      expect(result.stderr).toContain('SyntaxError');
    });
  });

  describe('timers and pending work', () => {
    it('[Given] timers of different delays [Then] they fire in delay order, after the script body', async () => {
      const result = await runScript(
        'setTimeout(() => console.log("30"), 30); setTimeout(() => console.log("5"), 5); setImmediate(() => console.log("now")); queueMicrotask(() => console.log("micro")); console.log("body")'
      );
      expect(result.stdout).toBe('body\nmicro\nnow\n5\n30\n');
    });

    it('[Given] setTimeout extra arguments [Then] the callback receives them', async () => {
      expect(
        (await runScript('setTimeout((a, b) => console.log(a + b), 1, 2, 3);\nundefined')).stdout
      ).toBe('5\n');
    });

    // A cleared timer the run still waited for would hold it for a minute, past the test timeout.
    it('[Given] a long timer cleared early [Then] the run ends without waiting for it', async () => {
      const result = await runScript(
        'const first = setTimeout(() => console.log("never"), 60_000); clearTimeout(first);\nconst second = setTimeout(() => console.log("never"), 60_000); await null; clearTimeout(second)'
      );
      expect(result).toMatchObject({ exitCode: 0, stdout: '' });
    });

    it('[Given] an error thrown in a timer callback [Then] the run exits 1', async () => {
      const result = await runScript('setTimeout(() => { throw new Error("in timer") }, 1)');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('in timer');
    });

    it('[Given] an execute() the script never awaits [Then] the run still waits for it and its callback', async () => {
      const execute = vi.fn(
        (slug: string) =>
          new Promise(resolve =>
            setTimeout(() => resolve({ data: { slug }, successful: true }), 20)
          )
      );
      const result = await runScript(
        'execute("A").then(result => execute("B")).then(result => console.log(result.data.slug)); console.log("body")',
        { helpers: { execute } }
      );
      expect(result.stdout).toBe('body\nB\n');
      expect(execute.mock.calls.map(([slug]) => slug)).toEqual(['A', 'B']);
    });
  });

  describe('process', () => {
    it('[Given] exit and beforeExit listeners [Then] they run when the script ends, with its exit code', async () => {
      const result = await runScript(
        'process.on("beforeExit", code => console.log("beforeExit", code)); process.once("exit", code => console.log("exit", code)); process.exitCode = 3; console.log("body")'
      );
      expect(result).toMatchObject({ exitCode: 3, stdout: 'body\nbeforeExit 3\nexit 3\n' });
    });

    it('[Given] an exit listener and process.exit [Then] the listener runs once, before the run stops', async () => {
      const result = await runScript(
        'process.on("exit", code => console.log("cleanup", code)); process.exit(5)'
      );
      expect(result).toMatchObject({ exitCode: 5, stdout: 'cleanup 5\n' });
    });

    it('[Given] a removed exit listener [Then] it does not run', async () => {
      const result = await runScript(
        'const listener = () => console.log("never"); process.on("exit", listener); void process.off("exit", listener)'
      );
      expect(result.stdout).toBe('');
    });

    it('[Given] a signal listener [Then] the script is warned once that it will never be called', async () => {
      const result = await runScript(
        'process.on("SIGINT", () => {}); process.on("SIGINT", () => {}); process.on("uncaughtException", () => {})'
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr.split('\n').filter(Boolean)).toEqual([
        'warning: process.on("SIGINT") is not supported in composio run; the listener will never be called. A signal stops the run.',
        'warning: process.on("uncaughtException") is not supported in composio run; the listener will never be called. A signal stops the run.',
      ]);
    });

    it('[Given] argv, env, and cwd [Then] the script sees them', async () => {
      const result = await runScript(
        'JSON.stringify([process.argv, process.env.TOKEN, process.cwd(), typeof process.platform, typeof process.on("SIGINT", () => {})])',
        { argv: ['/bin/composio', '--repo', 'acme/app'], env: { TOKEN: 'secret' } }
      );
      expect(JSON.parse(result.stdout)).toEqual([
        ['/bin/composio', '--repo', 'acme/app'],
        'secret',
        '/work',
        'string',
        'object',
      ]);
    });

    it('[Given] a script that sets an environment variable [Then] it only changes its own view', async () => {
      const env = { KEEP: '1' };
      await runScript('process.env.KEEP = "2"; process.env.NEW = "3"', { env });
      expect(env).toEqual({ KEEP: '1' });
    });
  });

  describe('helpers', () => {
    it('[Given] execute() [Then] it gets the slug, the data (default {}), and options, and returns a prompt-able result', async () => {
      const execute = vi.fn(() =>
        Promise.resolve({ successful: true, data: { login: 'octocat' } })
      );
      const result = await runScript(
        [
          'const first = await execute("GITHUB_GET_THE_AUTHENTICATED_USER");',
          'const second = await execute("GITHUB_GET_A_REPOSITORY", { owner: "acme" }, { account: "work" });',
          'console.log(first.data.login, Object.keys(first).join(","), first.prompt());',
        ].join('\n'),
        { helpers: { execute } }
      );
      expect(execute.mock.calls).toEqual([
        ['GITHUB_GET_THE_AUTHENTICATED_USER', {}, {}, expect.any(AbortSignal)],
        [
          'GITHUB_GET_A_REPOSITORY',
          { owner: 'acme' },
          { account: 'work' },
          expect.any(AbortSignal),
        ],
      ]);
      expect(result.stdout).toBe('octocat successful,data {\n  "login": "octocat"\n}\n');
    });

    it('[Given] a failed execute() [Then] it rejects with the tool error, carrying the failed result', async () => {
      const execute = () =>
        Promise.reject(
          Object.assign(new Error('Repository not found'), {
            slug: 'GITHUB_GET_A_REPOSITORY',
            result: { successful: false, error: 'Repository not found' },
          })
        );
      const result = await runScript(
        'try { await execute("GITHUB_GET_A_REPOSITORY") } catch (error) { console.log(error instanceof Error, error.message, error.slug, error.result.successful) }',
        { helpers: { execute } }
      );
      expect(result.stdout).toBe('true Repository not found GITHUB_GET_A_REPOSITORY false\n');
    });

    it('[Given] an uncaught execute() failure [Then] the run exits 1 with the tool error', async () => {
      const execute = () => Promise.reject(new Error('Tool failed'));
      const result = await runScript('await execute("X")', { helpers: { execute } });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('error: Tool failed');
    });

    it('[Given] search() [Then] it gets the query and options', async () => {
      const search = vi.fn(() => Promise.resolve({ results: [] }));
      await runScript('await search("send email", { toolkits: ["gmail"], limit: 2 })', {
        helpers: { search },
      });
      expect(search).toHaveBeenCalledWith(
        'send email',
        { toolkits: ['gmail'], limit: 2 },
        expect.any(AbortSignal)
      );
    });

    it('[Given] proxy() [Then] it returns a fetch function whose responses read like fetch responses', async () => {
      const proxyFetch = vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ login: 'octocat' }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          })
        )
      );
      const proxy = vi.fn(() => Promise.resolve(Object.assign(proxyFetch, { toolkit: 'github' })));
      const result = await runScript(
        [
          'const gh = await proxy(" github ");',
          'const response = await gh(new URL("https://api.github.com/user"), { method: "POST", body: "{}" });',
          'console.log(gh.toolkit, response.status, response.ok, response.headers.get("content-type"), (await response.json()).login, typeof proxy.schema);',
        ].join('\n'),
        { helpers: { proxy } }
      );
      expect(proxy).toHaveBeenCalledWith(' github ', expect.any(AbortSignal));
      expect(proxyFetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        { method: 'POST', body: '{}' },
        expect.any(AbortSignal)
      );
      expect(result.stdout).toBe('github 201 true application/json octocat object\n');
    });

    it('[Given] a failed proxy call [Then] it rejects with its status and response', async () => {
      const proxyFetch = () =>
        Promise.reject(
          Object.assign(new Error('Composio proxy request failed with status 403'), { status: 403 })
        );
      const proxy = () => Promise.resolve(Object.assign(proxyFetch, { toolkit: 'github' }));
      const result = await runScript(
        'const gh = await proxy("github"); await gh("https://api.github.com/user").catch(error => console.log(error.message, error.status))',
        { helpers: { proxy } }
      );
      expect(result.stdout).toBe('Composio proxy request failed with status 403 403\n');
    });

    it('[Given] File and Blob values in execute() data [Then] the helper gets real ones with the same bytes', async () => {
      const execute = vi.fn((_slug: string, _data: unknown) =>
        Promise.resolve({ successful: true })
      );
      const result = await runScript(
        [
          'const file = new File(["hello ", new Uint8Array([119, 111, 114, 108, 100])], "greeting.txt", { type: "text/plain" });',
          'const blob = new Blob([file, "!"]);',
          'console.log(file instanceof Blob, file.name, file.size, blob.size, await blob.text());',
          'const sent = await execute("GMAIL_SEND_EMAIL", { attachment: file, extra: [blob] });',
        ].join('\n'),
        { helpers: { execute } }
      );
      expect(result.stdout).toBe('true greeting.txt 11 12 hello world!\n');
      const data = execute.mock.calls[0]![1] as { attachment: File; extra: Array<Blob> };
      expect(data.attachment).toBeInstanceOf(File);
      expect(data.attachment.name).toBe('greeting.txt');
      expect(data.attachment.type).toBe('text/plain');
      expect(await data.attachment.text()).toBe('hello world');
      expect(data.extra[0]).toBeInstanceOf(Blob);
      expect(await data.extra[0]!.text()).toBe('hello world!');
    });

    it('[Given] the removed sub-agent helpers [Then] both reject with the removal message', async () => {
      const result = await runScript(
        'for (const helper of [experimental_subAgent, invokeAgent]) await helper("p").catch(error => console.log(error.message))'
      );
      expect(result.stdout).toBe(
        'experimental_subAgent() was removed.\nexperimental_subAgent() was removed.\n'
      );
    });

    it('[Given] globalThis [Then] it exposes the injected helpers and the run context', async () => {
      const result = await runScript(
        '[typeof globalThis.execute, typeof globalThis.z.object, globalThis.__composioRunContext.logFilePath, __composioConsumerContext.consumerUserId].join(" ")'
      );
      expect(result.stdout).toBe('function function /tmp/out/run.log user-1\n');
    });
  });

  describe('fetch', () => {
    it('[Given] fetch() [Then] it reaches the network through the host and returns a readable response', async () => {
      const fetchMock = vi.fn(() => Promise.resolve(new Response('pong', { status: 200 })));
      vi.stubGlobal('fetch', fetchMock);
      const result = await runScript(
        'const response = await fetch("https://example.test/ping", { method: "POST", headers: { "x-a": "1" } }); console.log(response.status, await response.text())'
      );
      expect(result.stdout).toBe('200 pong\n');
      expect(fetchMock).toHaveBeenCalledWith('https://example.test/ping', {
        method: 'POST',
        headers: { 'x-a': '1' },
        signal: expect.any(AbortSignal),
      });
    });

    it('[Given] a Blob body [Then] fetch() sends its bytes', async () => {
      const fetchMock = vi.fn((_input: string, _init: RequestInit) =>
        Promise.resolve(new Response('ok'))
      );
      vi.stubGlobal('fetch', fetchMock);
      await runScript(
        'await fetch("https://example.test/upload", { method: "POST", body: new Blob(["hello"], { type: "text/plain" }) })'
      );
      const body = fetchMock.mock.calls[0]![1].body;
      expect(body).toBeInstanceOf(Blob);
      expect(await (body as Blob).text()).toBe('hello');
    });

    it('[Given] a File body [Then] the proxy() fetch function gets a real File', async () => {
      const proxyInit = vi.fn((_init: unknown) => {});
      const proxy = () =>
        Promise.resolve(async (_input: unknown, init: unknown) => {
          proxyInit(init);
          return new Response('ok');
        });
      await runScript(
        'const send = await proxy("github"); await send("/upload", { method: "POST", body: new File(["data"], "a.txt") })',
        { helpers: { proxy } }
      );
      const { body } = proxyInit.mock.calls[0]![0] as { body: File };
      expect(body).toBeInstanceOf(File);
      expect(body.name).toBe('a.txt');
      expect(await body.text()).toBe('data');
    });
  });

  describe('z', () => {
    it('[Given] a schema [Then] parse and safeParse validate like zod', async () => {
      const result = await runScript(
        [
          'const User = z.object({ login: z.string(), age: z.number().int().optional(), role: z.enum(["admin", "member"]).default("member") });',
          'console.log(JSON.stringify(User.parse({ login: "octocat", extra: true })));',
          'const failed = User.safeParse({ login: 1 });',
          'console.log(failed.success, failed.error.issues[0].path.join("."), failed.error.issues[0].code);',
          'console.log(z.array(z.string()).min(1).safeParse([]).success, z.coerce.number().parse("42"));',
        ].join('\n')
      );
      expect(result.stdout).toBe(
        '{"login":"octocat","role":"member"}\nfalse login invalid_type\nfalse 42\n'
      );
    });

    it('[Given] parse fails [Then] it throws a ZodError carrying the issues', async () => {
      const result = await runScript(
        'try { z.string().parse(1) } catch (error) { console.log(error.name, error instanceof z.ZodError, error instanceof Error, error.issues.length, error.message.includes("expected string")) }'
      );
      expect(result.stdout).toBe('ZodError true true 1 true\n');
    });

    it('[Given] safeParse fails [Then] its error is a ZodError', async () => {
      const result = await runScript(
        'const failed = z.number().safeParse("x");\n[failed.error instanceof z.ZodError, failed.error.issues[0].code].join(" ")'
      );
      expect(result.stdout).toBe('true invalid_type\n');
    });

    it('[Given] an import of zod [Then] it binds to the injected z', async () => {
      const result = await runScript('import { z as zod } from "zod";\nzod.string().parse("ok")');
      expect(result.stdout).toBe('ok\n');
    });

    it('[Given] a refinement callback [Then] it fails with a message saying callbacks are unsupported', async () => {
      const result = await runScript('z.string().refine(value => value.length > 2)');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('refine() with a callback is not supported in composio run');
    });
  });

  describe('confinement', () => {
    it('[Given] an import of a Node.js module [Then] it fails before running, with a hint', async () => {
      const result = await runScript('import { readFileSync } from "node:fs";\nconsole.log("ran")');
      expect(result).toMatchObject({ exitCode: 1, stdout: '' });
      expect(result.stderr).toContain('Cannot import "node:fs"');
      expect(result.stderr).toContain(
        'hint: composio run scripts run in a confined JavaScript runtime'
      );
    });

    it('[Given] a re-export from a module [Then] the module is loaded like an import, so it fails loudly', async () => {
      const result = await runScript('export * from "./setup.js";\nconsole.log("ran")', {
        fileName: '/work/script.js',
      });
      expect(result).toMatchObject({ exitCode: 1, stdout: '' });
      expect(result.stderr).toContain('Cannot import "./setup.js"');
    });

    it('[Given] an import of a package [Then] it fails before running', async () => {
      const result = await runScript('import _ from "lodash";\nconsole.log("ran")');
      expect(result).toMatchObject({ exitCode: 1, stdout: '' });
      expect(result.stderr).toContain('Cannot import "lodash"');
    });

    // Gaps of the confined runtime that Bun covered. They fail loudly rather than misbehave.
    it.each([
      { feature: 'Symbol()', source: 'Symbol("id")', message: 'Symbol is not callable' },
      {
        feature: 'private class fields',
        source: 'class A { #x = 1 }',
        message: 'Private class members',
      },
      {
        feature: 'Intl',
        source: 'new Intl.NumberFormat("en")',
        message: "Unknown identifier 'Intl'",
      },
      { feature: 'Bun APIs', source: 'Bun.file("x")', message: "Unknown identifier 'Bun'" },
      {
        feature: 'new on a function',
        source: 'function F() {}\nnew F()',
        message: 'not a constructor',
      },
      { feature: 'eval', source: 'eval("1")', message: 'eval' },
    ])(
      '[Given] $feature [Then] the run fails with a message naming it',
      async ({ source, message }) => {
        const result = await runScript(source);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(message);
      }
    );
  });

  describe('cancellation', () => {
    it('[Given] the caller aborts [Then] the run rejects and the helper call in flight is aborted', async () => {
      const controller = new AbortController();
      let helperStarted!: (signal: AbortSignal) => void;
      const started = new Promise<AbortSignal>(resolve => {
        helperStarted = resolve;
      });
      const execute = (_slug: string, _data: unknown, _options: unknown, signal: AbortSignal) => {
        helperStarted(signal);
        return new Promise(() => {});
      };
      const run = runScript('await execute("SLOW"); console.log("never")', {
        helpers: { execute },
        signal: controller.signal,
      });
      const helperSignal = await started;
      expect(helperSignal.aborted).toBe(false);
      controller.abort(new Error('SIGINT'));
      await expect(run).rejects.toMatchObject({ name: 'AbortError' });
      // The tool execution itself is told to stop, not only abandoned.
      expect(helperSignal.aborted).toBe(true);
    });

    it('[Given] process.exit while an execute() is in flight [Then] the helper call is aborted', async () => {
      let helperSignal: AbortSignal | undefined;
      const execute = (_slug: string, _data: unknown, _options: unknown, signal: AbortSignal) => {
        helperSignal = signal;
        return new Promise(() => {});
      };
      const result = await runScript(
        'execute("SEND_EMAIL"); setTimeout(() => process.exit(2), 5)',
        {
          helpers: { execute },
        }
      );
      expect(result.exitCode).toBe(2);
      expect(helperSignal?.aborted).toBe(true);
    });

    it('[Given] an already aborted signal [Then] the script does not run', async () => {
      const controller = new AbortController();
      controller.abort(new Error('SIGINT'));
      const io = captureIo();
      await expect(
        runScriptProgram({
          program: prepareRunProgram('console.log("ran")'),
          source: 'console.log("ran")',
          displayName: '[eval]',
          argv: [],
          env: {},
          cwd: '/work',
          helpers: fakeHelpers(),
          io,
          signal: controller.signal,
        })
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(io.captured.stdout).toBe('');
    });

    it('[Given] the caller aborts while proxy() sets up [Then] the setup request is aborted', async () => {
      const controller = new AbortController();
      let setupStarted!: (signal: AbortSignal) => void;
      const started = new Promise<AbortSignal>(resolve => {
        setupStarted = resolve;
      });
      const proxy = (_toolkit: string, signal: AbortSignal) => {
        setupStarted(signal);
        return new Promise<never>(() => {});
      };
      const run = runScript('await proxy("github")', {
        helpers: { proxy },
        signal: controller.signal,
      });
      const setupSignal = await started;
      controller.abort(new Error('SIGINT'));
      await expect(run).rejects.toMatchObject({ name: 'AbortError' });
      expect(setupSignal.aborted).toBe(true);
    });

    it('[Given] process.exit while the caller is aborting [Then] the abort wins', async () => {
      const controller = new AbortController();
      controller.abort(new Error('SIGINT'));
      await expect(
        runScript('process.exit(0)', { signal: controller.signal })
      ).rejects.toMatchObject({
        name: 'AbortError',
      });
    });
  });
});
