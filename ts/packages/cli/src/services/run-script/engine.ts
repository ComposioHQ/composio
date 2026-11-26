/**
 * Runs a `composio run` script in psychoscript, a confined JavaScript interpreter, inside the CLI's
 * own process.
 *
 * The VM reaches nothing by itself: no files, network, timers, or process. Everything a script
 * may use is a host function defined here, and the prelude (`prelude.ts`) builds the familiar
 * globals (`setTimeout`, `process`, `execute`, `z`, …) on top of them. The script's own source
 * is prepared by `prepareRunProgram` (`src/commands/run-source-transforms.ts`).
 *
 * It runs outside the Effect runtime, so it works with promises, and writes the script's output to
 * the streams it is given (`scriptOutputStreams` in production).
 */
import { formatWithOptions } from 'node:util';
import process from 'node:process';
import { Host, Runtime, StreamingResponse } from 'psychoscript';
import { SourceMapConsumer } from 'source-map-js';
import { makeZodBridge } from './zod-bridge';
import { RUN_SCRIPT_PRELUDE } from './prelude';
import type { PreparedRunProgram } from 'src/commands/run-source-transforms';

export type { PreparedRunProgram };

/**
 * What a script runs with: the injected helpers, and what it sees as its process. Each call gets
 * the signal of the host call that made it, which aborts when the run stops (an interrupt,
 * `process.exit()`), so a tool execution in flight is cancelled rather than left running.
 */
export type RunScriptHelpers = {
  readonly execute: (
    slug: string,
    data: unknown,
    options: unknown,
    signal: AbortSignal
  ) => Promise<unknown>;
  readonly search: (query: string, options: unknown, signal: AbortSignal) => Promise<unknown>;
  readonly proxy: (
    toolkit: string,
    signal: AbortSignal
  ) => Promise<(input: unknown, init: unknown, signal: AbortSignal) => Promise<Response>>;
  /** A plain JSON description of `proxy()`, exposed as `proxy.schema`. */
  readonly proxySchema: unknown;
  readonly removedSubAgentMessage: string;
  readonly runContext: unknown;
  readonly consumerContext: unknown;
};

export type RunScriptIo = {
  readonly stdout: (chunk: string) => void;
  readonly stderr: (chunk: string) => void;
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
};

export type RunScriptParams = {
  readonly program: PreparedRunProgram;
  /** How errors name the script: its path, or `[eval]` for inline code. */
  readonly displayName: string;
  /** The script's original source, to quote the line an uncaught error points at. */
  readonly source: string;
  readonly argv: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly helpers: RunScriptHelpers;
  readonly io: RunScriptIo;
  readonly signal?: AbortSignal;
};

/** How a script ended. */
export type RunScriptOutcome = { readonly exitCode: number };

/** The line that follows the user's code: print a trailing value, wait for pending work, report. */
const EPILOGUE = [
  '})().catch(__composioReport);',
  'if (__composioResult !== undefined) console.log(__composioResult);',
  'while (await __composioIdle()) {}',
  '__composioEnd();',
  '__composioFinish(process.exitCode);',
].join(' ');

const OPENER = 'const __composioResult = await (async () => {';

/** Each line of a console call, formatted the way Node and Bun print them. */
const formatConsoleArgs = (args: ReadonlyArray<unknown>, colors: boolean): string =>
  `${formatWithOptions({ colors, depth: 4 }, ...args)}\n`;

/** An error from host code, as data the prelude turns back into an `Error`. */
const errorData = (error: unknown) => {
  if (error instanceof Error) {
    const props: Record<string, unknown> = {};
    for (const key of Object.keys(error)) {
      const value: unknown = Reflect.get(error, key);
      if (typeof value !== 'function') props[key] = value;
    }
    return { name: error.name, message: error.message, props };
  }
  return { name: 'Error', message: String(error), props: {} };
};

const settle = (run: () => Promise<unknown>) =>
  run().then(
    value => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error: errorData(error) })
  );

const BLOB_KEY = '__composioBlob';

type BlobData = {
  readonly base64: string;
  readonly type: string;
  readonly size: number;
  readonly name?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const blobData = (value: unknown): BlobData | undefined => {
  if (!isRecord(value)) return undefined;
  const data = value[BLOB_KEY];
  if (
    !isRecord(data) ||
    typeof data.base64 !== 'string' ||
    typeof data.type !== 'string' ||
    typeof data.size !== 'number'
  ) {
    return undefined;
  }
  return {
    base64: data.base64,
    type: data.type,
    size: data.size,
    ...(typeof data.name === 'string' ? { name: data.name } : {}),
  };
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), char => char.charCodeAt(0));

const bytesOfPart = (part: unknown): Uint8Array => {
  const data = blobData(part);
  if (data) return fromBase64(data.base64);
  if (part instanceof Uint8Array) return part;
  if (part instanceof ArrayBuffer) return new Uint8Array(part);
  return new TextEncoder().encode(String(part));
};

const makeBlobData = (parts: unknown, type: string): BlobData => {
  const chunks = (Array.isArray(parts) ? parts : [parts]).map(bytesOfPart);
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  chunks.reduce((offset, chunk) => {
    bytes.set(chunk, offset);
    return offset + chunk.length;
  }, 0);
  return { base64: toBase64(bytes), type, size: bytes.length };
};

/**
 * A script's `File` and `Blob` cross the VM boundary as data; the helpers expect the host's own,
 * so each one becomes a real `File` or `Blob` again before `execute()` stages it for upload.
 */
const reviveBlobs = (value: unknown): unknown => {
  const data = blobData(value);
  if (data) {
    const bytes = fromBase64(data.base64);
    return typeof data.name === 'string'
      ? new File([bytes], data.name, { type: data.type })
      : new Blob([bytes], { type: data.type });
  }
  if (Array.isArray(value)) return value.map(reviveBlobs);
  if (isRecord(value) && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, reviveBlobs(entry)])
    );
  }
  return value;
};

/** A request init from the script, with a `Blob` or `File` body made real again. */
const reviveRequestInit = (init: Record<string, unknown>): Record<string, unknown> =>
  'body' in init ? { ...init, body: reviveBlobs(init.body) } : init;

/** The script's `fetch`: the host's, with the body made real and the host call's signal. */
const hostFetch = (track: <A>(promise: Promise<A>) => Promise<A>) =>
  Host.fn(
    ([input, init], call) =>
      track(
        fetch(String(input), {
          ...(isRecord(init) ? (reviveRequestInit(init) as RequestInit) : {}),
          signal: call.signal,
        }).then(response => new StreamingResponse(response))
      ),
    { type: 'async' }
  );

/** Runs `code`, unless the run was aborted before it could start. */
const execute = (runtime: Runtime, code: string, signal: AbortSignal) =>
  signal.aborted
    ? Promise.reject(new DOMException('The run was aborted before it started.', 'AbortError'))
    : runtime.execute(code, { signal });

/** Thrown by `process.exit` once the run is stopping. */
const EXIT_FAILURE_KIND = 'ProcessExit';

/** A field of a value the script threw, as text: `String()` of what is there. */
const fieldText = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value as string);

const LOCATION_SUFFIX = / \(line (\d+), col (\d+)\)$/;

type ScriptError = {
  readonly kind: string;
  readonly message: string;
  readonly location?: { readonly line: number; readonly column: number };
};

/**
 * Where an error is in the user's script, from its place in the program the VM ran: the first
 * line starts with the prelude, and a compiled script maps back through its source map.
 */
const scriptPosition = (
  location: { readonly line: number; readonly column: number },
  firstLineOffset: number,
  program: PreparedRunProgram,
  sourceMap: SourceMapConsumer | undefined
): { readonly line: number; readonly column: number } | undefined => {
  const inBody = location.column - 1 - (location.line === 1 ? firstLineOffset : 0);
  if (inBody < 0) return undefined;
  const column = (program.columnShifts ?? [])
    .filter(shift => shift.line === location.line)
    .sort((left, right) => left.column - right.column)
    .reduce(
      (at, shift) => (at >= shift.column + Math.max(shift.delta, 0) ? at - shift.delta : at),
      inBody
    );
  if (!sourceMap) return { line: location.line, column };
  const original = sourceMap.originalPositionFor({ line: location.line, column });
  return original.line === null || original.line === undefined
    ? undefined
    : { line: original.line, column: original.column ?? 0 };
};

/**
 * Prints an uncaught error the way Bun did: the source line with a caret, then `error: <message>`
 * and where it happened, all on stderr.
 */
const describeFailure = (params: {
  readonly error: ScriptError;
  readonly source: string;
  readonly displayName: string;
  readonly firstLineOffset: number;
  readonly program: PreparedRunProgram;
  readonly sourceMap: SourceMapConsumer | undefined;
}): string => {
  const { error, source, displayName } = params;
  const message = error.message
    .replace(LOCATION_SUFFIX, '')
    .replace(/^Uncaught: /, '')
    .replace(/^Error: /, '');
  const position = error.location
    ? scriptPosition(error.location, params.firstLineOffset, params.program, params.sourceMap)
    : undefined;
  const lines: Array<string> = [];
  const sourceLine = position ? source.split('\n')[position.line - 1] : undefined;
  if (position && sourceLine !== undefined) {
    lines.push(`${position.line} | ${sourceLine}`);
    lines.push(`${' '.repeat(String(position.line).length + 3 + position.column)}^`);
  }
  lines.push(`error: ${message}`);
  if (position) {
    lines.push(`    at ${displayName}:${position.line}:${position.column + 1}`);
  }
  if (/Cannot import /.test(message)) {
    lines.push(IMPORT_HINT);
  }
  return `${lines.join('\n')}\n`;
};

const IMPORT_HINT =
  'hint: composio run scripts run in a confined JavaScript runtime with execute(), search(), proxy(), fetch() and z injected; they cannot import packages or Node.js modules. Use @composio/core from your own Node.js or Bun project for that.';

/**
 * Runs a prepared script to its end: output goes to `io` as it is produced, and the outcome is
 * the exit code a process running the script would have had. Aborting `signal` stops the run and
 * every host call in progress, and the promise rejects with an `AbortError`.
 */
export const runScriptProgram = async (params: RunScriptParams): Promise<RunScriptOutcome> => {
  const { io } = params;
  const { helpers } = params;
  const stop = new AbortController();
  const onAbort = () => stop.abort(params.signal?.reason);
  params.signal?.addEventListener('abort', onAbort, { once: true });
  // A run whose caller already gave up never starts.
  if (params.signal?.aborted) onAbort();

  // Set once the script asked to exit: from then on nothing it does reaches the outside.
  let exitRequested: number | undefined;
  let finishedWith: number | undefined;
  // The script's uncaught error, as it reported it: the VM's own report carries no location.
  let uncaught:
    { readonly name: string; readonly message: string; readonly stack: string } | undefined;
  const live = () => exitRequested === undefined;

  // Host calls the script has not seen settle yet. The run waits for them before it ends, as a
  // process waits for its event loop, so an un-awaited `execute()` or timer still completes.
  let pending = 0;
  const idleWaiters: Array<() => void> = [];
  const track = <A>(promise: Promise<A>): Promise<A> => {
    pending++;
    return promise.finally(() => {
      pending--;
      if (pending === 0) {
        // A macrotask later, so the script's callbacks for the last call run first.
        setImmediate(() => {
          if (pending === 0) idleWaiters.splice(0).forEach(resolve => resolve());
        });
      }
    });
  };

  const sleeps = new Map<
    number,
    { readonly timer: ReturnType<typeof setTimeout>; readonly resolve: (fired: boolean) => void }
  >();
  // Timers cleared before their sleep started: the VM starts an async host call at its next
  // stop, so `clearTimeout` right after `setTimeout` reaches the host first.
  const cancelledSleeps = new Set<number>();
  const proxyFetches: Array<
    (input: unknown, init: unknown, signal: AbortSignal) => Promise<Response>
  > = [];
  const zod = makeZodBridge();

  const write = (stream: 'stdout' | 'stderr', chunk: string) => {
    if (!live()) return;
    if (stream === 'stdout') io.stdout(chunk);
    else io.stderr(chunk);
  };
  const consoleMethod = (stream: 'stdout' | 'stderr') =>
    Host.fn(args => {
      write(stream, formatConsoleArgs(args, stream === 'stdout' ? io.stdoutIsTTY : io.stderrIsTTY));
    });

  const runtime = Runtime.make({
    translate: { functions: 'drop', promises: 'await' },
    globals: () => ({
      console: {
        log: consoleMethod('stdout'),
        info: consoleMethod('stdout'),
        debug: consoleMethod('stdout'),
        dir: consoleMethod('stdout'),
        table: consoleMethod('stdout'),
        warn: consoleMethod('stderr'),
        error: consoleMethod('stderr'),
        trace: consoleMethod('stderr'),
      },
      fetch: hostFetch(track),
      __composioProcess: {
        argv: [...params.argv],
        env: { ...params.env },
        cwd: params.cwd,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        version: process.version,
        versions: { ...process.versions },
        stdoutIsTTY: io.stdoutIsTTY,
        stderrIsTTY: io.stderrIsTTY,
      },
      __composioContext: {
        run: helpers.runContext ?? null,
        consumer: helpers.consumerContext ?? null,
      },
      __composioProxySchema: helpers.proxySchema ?? null,
      __composioRemovedSubAgentMessage: helpers.removedSubAgentMessage,
      __composioWrite: Host.fn(([stream, chunk]) => {
        write(stream === 'stderr' ? 'stderr' : 'stdout', String(chunk));
        return true;
      }),
      __composioExit: Host.fn(([code]) => {
        exitRequested ??= Number.isInteger(Number(code)) ? Number(code) : 0;
        stop.abort(new Error('process.exit'));
        throw Host.fail(EXIT_FAILURE_KIND, 'process.exit() was called.');
      }),
      __composioUncaught: Host.fn(([error]) => {
        if (isRecord(error)) {
          uncaught = {
            name: fieldText(error.name),
            message: fieldText(error.message),
            stack: fieldText(error.stack),
          };
        }
      }),
      __composioFinish: Host.fn(([code]) => {
        finishedWith = code === undefined || code === null ? 0 : Number(code) || 0;
      }),
      __composioSleep: Host.fn(
        ([id, ms]) =>
          track(
            new Promise<boolean>(resolve => {
              if (cancelledSleeps.delete(Number(id))) {
                resolve(false);
                return;
              }
              const timer = setTimeout(
                () => {
                  sleeps.delete(Number(id));
                  resolve(true);
                },
                Math.max(0, Number(ms) || 0)
              );
              sleeps.set(Number(id), { timer, resolve });
            })
          ),
        { type: 'async' }
      ),
      __composioCancelSleep: Host.fn(([id]) => {
        const sleep = sleeps.get(Number(id));
        if (sleep) {
          clearTimeout(sleep.timer);
          sleeps.delete(Number(id));
          sleep.resolve(false);
        } else {
          cancelledSleeps.add(Number(id));
        }
      }),
      __composioIdle: Host.fn(
        () =>
          pending === 0
            ? false
            : new Promise<boolean>(resolve => idleWaiters.push(() => resolve(true))),
        { type: 'async' }
      ),
      __composioHelper: Host.fn(
        ([name, args], call) =>
          track(
            settle(async () => {
              const [first, second, third] = Array.isArray(args) ? args : [];
              if (!live()) return new Promise(() => {});
              switch (name) {
                case 'execute':
                  return helpers.execute(String(first), reviveBlobs(second), third, call.signal);
                case 'search':
                  return helpers.search(String(first), second, call.signal);
                case 'proxy': {
                  const proxyFetch = await helpers.proxy(String(first), call.signal);
                  proxyFetches.push(proxyFetch);
                  const toolkit: unknown = Reflect.get(proxyFetch, 'toolkit');
                  return {
                    handle: proxyFetches.length - 1,
                    toolkit: typeof toolkit === 'string' ? toolkit : String(first).trim(),
                  };
                }
                default:
                  throw new Error(`Unknown helper ${String(name)}`);
              }
            }).then(outcome => (call.signal.aborted ? new Promise(() => {}) : outcome))
          ),
        { type: 'async' }
      ),
      __composioProxyFetch: Host.fn(
        ([handle, input, init], call) =>
          track(
            settle(async () => {
              const proxyFetch = proxyFetches[Number(handle)];
              if (!proxyFetch) throw new Error('This proxy() fetch function is no longer valid.');
              return new StreamingResponse(
                await proxyFetch(
                  input,
                  isRecord(init) ? reviveRequestInit(init) : init,
                  call.signal
                )
              );
            })
          ),
        { type: 'async' }
      ),
      ...valueGlobals(zod),
    }),
  });

  const head = `${params.program.imports}${params.program.imports ? ' ' : ''}${RUN_SCRIPT_PRELUDE} ${OPENER} `;
  const code = `${head}${params.program.body}\n${EPILOGUE}`;

  const sourceMap = params.program.sourceMap
    ? new SourceMapConsumer(JSON.parse(params.program.sourceMap))
    : undefined;
  const describe = (error: ScriptError) =>
    describeFailure({
      error,
      source: params.source,
      displayName: params.displayName,
      firstLineOffset: head.length,
      program: params.program,
      sourceMap,
    });

  return execute(runtime, code, stop.signal)
    .then(
      (result): RunScriptOutcome => {
        if (!result.ok) {
          io.stderr(describe(withUncaughtLocation(result.error, uncaught)));
          return { exitCode: 1 };
        }
        // An un-awaited promise that rejected would have crashed a process; it fails the run.
        const unhandled = (result.warnings ?? []).filter(warning =>
          UNHANDLED_REJECTION.test(warning.message)
        );
        unhandled.forEach(warning =>
          io.stderr(
            describe({
              kind: warning.kind,
              message: warning.message.replace(UNHANDLED_REJECTION, ''),
            })
          )
        );
        return { exitCode: unhandled.length > 0 ? 1 : (finishedWith ?? 0) };
      },
      (error: unknown): RunScriptOutcome => {
        // `process.exit()` stops the run by aborting it; any other rejection is the caller's.
        if (exitRequested !== undefined && !params.signal?.aborted) {
          return { exitCode: exitRequested };
        }
        throw error;
      }
    )
    .finally(() => {
      params.signal?.removeEventListener('abort', onAbort);
      sleeps.forEach(sleep => clearTimeout(sleep.timer));
      sleeps.clear();
    });
};

/** Host functions over plain values: `Blob` contents and `z` schemas kept on the host. */
const valueGlobals = (zod: ReturnType<typeof makeZodBridge>) => ({
  __composioZodKeys: zod.keys,
  __composioBlob: Host.fn(([parts, type]) => makeBlobData(parts, String(type ?? ''))),
  __composioBlobText: Host.fn(([data]) => {
    const blob = blobData({ [BLOB_KEY]: data });
    return blob ? new TextDecoder().decode(fromBase64(blob.base64)) : '';
  }),
  __composioBlobBytes: Host.fn(([data]) => {
    const blob = blobData({ [BLOB_KEY]: data });
    return blob ? fromBase64(blob.base64) : new Uint8Array();
  }),
  __composioZod: Host.fn(([id, method, args]) =>
    zod.call(Number(id), String(method), Array.isArray(args) ? args : [])
  ),
});

const UNHANDLED_REJECTION = /^Unhandled rejection from an un-awaited promise: /;

const PROGRAM_FRAME = /<program>:(\d+):(\d+)/;

/** The VM's failure, with the location and message of the error the script threw, when known. */
const withUncaughtLocation = (
  error: ScriptError,
  thrown: { readonly name: string; readonly message: string; readonly stack: string } | undefined
): ScriptError => {
  if (!thrown || error.location) return error;
  const frame = PROGRAM_FRAME.exec(thrown.stack);
  const message =
    thrown.name === '' || thrown.name === 'Error'
      ? thrown.message
      : `${thrown.name}: ${thrown.message}`;
  return {
    kind: error.kind,
    message,
    ...(frame ? { location: { line: Number(frame[1]), column: Number(frame[2]) } } : {}),
  };
};
