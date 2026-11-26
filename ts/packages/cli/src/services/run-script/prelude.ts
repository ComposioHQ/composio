/**
 * The program-side half of `composio run`'s confined runtime: JavaScript that runs inside the
 * psychoscript VM before the user's script, in the same scope.
 *
 * The VM has no timers, no `process`, no `Blob`, and passes only data across its boundary, so
 * what a script expects from a JavaScript runtime is built here out of plain JavaScript and a few
 * host functions (`__composio*`, defined in `engine.ts`). Errors a helper reports cross as data
 * and are rebuilt here, so a script still gets an `Error` carrying `result`, `status`, and the
 * other fields it had under Bun.
 *
 * The source is joined into one line (`RUN_SCRIPT_PRELUDE`) so the user's code keeps its own line
 * numbers. Keep it free of line comments and of string literals with newlines, and end every
 * statement with a semicolon.
 */
const PRELUDE_SOURCE = `
class ZodError extends Error {
  constructor(message, issues) {
    super(message);
    this.name = 'ZodError';
    this.issues = issues === undefined ? [] : issues;
  }
}
const __composioError = (data) => {
  const error = data.name === 'ZodError' ? new ZodError(data.message) : new Error(data.message);
  if (typeof data.name === 'string' && data.name !== 'Error') error.name = data.name;
  if (data.props !== null && typeof data.props === 'object') {
    for (const key of Object.keys(data.props)) error[key] = data.props[key];
  }
  return error;
};
const __composioReport = (error) => {
  __composioUncaught(error !== null && typeof error === 'object' ? { name: String(error.name), message: String(error.message), stack: typeof error.stack === 'string' ? error.stack : '' } : { name: '', message: String(error), stack: '' });
  throw error;
};
const __composioUnwrap = (outcome) => {
  if (outcome.ok) return outcome.value;
  throw __composioError(outcome.error);
};
const __composioStringify = (value) => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};
const __composioAttachPrompt = (value) => {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.prompt === 'function') return value;
  Object.defineProperty(value, 'prompt', {
    value: () => __composioStringify('data' in value ? value.data : value),
    enumerable: false,
  });
  return value;
};
let __composioTimerSeq = 0;
const __composioTimers = new Set();
const setTimeout = (callback, ms, ...args) => {
  const id = ++__composioTimerSeq;
  __composioTimers.add(id);
  __composioSleep(id, Number(ms) || 0).then((fired) => {
    if (fired && __composioTimers.delete(id) && typeof callback === 'function') callback(...args);
  });
  return id;
};
const setInterval = (callback, ms, ...args) => {
  const id = ++__composioTimerSeq;
  __composioTimers.add(id);
  const tick = () => __composioSleep(id, Number(ms) || 0).then((fired) => {
    if (!fired || !__composioTimers.has(id)) return;
    if (typeof callback === 'function') callback(...args);
    if (__composioTimers.has(id)) tick();
  });
  tick();
  return id;
};
const clearTimeout = (id) => {
  if (__composioTimers.delete(id)) __composioCancelSleep(id);
};
const clearInterval = clearTimeout;
const setImmediate = (callback, ...args) => setTimeout(callback, 0, ...args);
const clearImmediate = clearTimeout;
const queueMicrotask = (callback) => { Promise.resolve().then(() => callback()); };
const __composioExitListeners = { exit: [], beforeExit: [] };
const __composioWarned = new Set();
const __composioOn = (event, listener) => {
  const name = String(event);
  if (name === 'exit' || name === 'beforeExit') {
    if (typeof listener === 'function') __composioExitListeners[name].push(listener);
  } else if (!__composioWarned.has(name)) {
    __composioWarned.add(name);
    __composioWrite('stderr', 'warning: process.on(' + JSON.stringify(name) + ') is not supported in composio run; the listener will never be called. A signal stops the run.' + String.fromCharCode(10));
  }
};
const __composioOff = (event, listener) => {
  const listeners = __composioExitListeners[String(event)];
  if (listeners !== undefined) {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  }
};
let __composioExiting = false;
const __composioRunExitListeners = (event, code) => {
  for (const listener of __composioExitListeners[event].slice()) listener(code);
};
const process = {
  argv: __composioProcess.argv,
  env: __composioProcess.env,
  platform: __composioProcess.platform,
  arch: __composioProcess.arch,
  pid: __composioProcess.pid,
  version: __composioProcess.version,
  versions: __composioProcess.versions,
  exitCode: undefined,
  cwd: () => __composioProcess.cwd,
  exit: (code) => {
    const exitCode = code === undefined ? process.exitCode : code;
    if (!__composioExiting) {
      __composioExiting = true;
      process.exitCode = exitCode;
      __composioRunExitListeners('exit', exitCode);
    }
    return __composioExit(process.exitCode);
  },
  stdout: { isTTY: __composioProcess.stdoutIsTTY, write: (chunk) => __composioWrite('stdout', String(chunk)) },
  stderr: { isTTY: __composioProcess.stderrIsTTY, write: (chunk) => __composioWrite('stderr', String(chunk)) },
  on: (event, listener) => { __composioOn(event, listener); return process; },
  once: (event, listener) => { __composioOn(event, listener); return process; },
  off: (event, listener) => { __composioOff(event, listener); return process; },
  addListener: (event, listener) => { __composioOn(event, listener); return process; },
  removeListener: (event, listener) => { __composioOff(event, listener); return process; },
};
class Blob {
  constructor(parts, options) {
    const data = __composioBlob(parts === undefined ? [] : parts, options && options.type !== undefined ? String(options.type) : '');
    this.__composioBlob = data;
    this.size = data.size;
    this.type = data.type;
  }
  async text() { return __composioBlobText(this.__composioBlob); }
  async bytes() { return __composioBlobBytes(this.__composioBlob); }
  async arrayBuffer() { return (await this.bytes()).buffer; }
}
class File extends Blob {
  constructor(parts, name, options) {
    super(parts, options);
    this.name = String(name);
    this.lastModified = options && typeof options.lastModified === 'number' ? options.lastModified : Date.now();
    this.__composioBlob = { ...this.__composioBlob, name: this.name };
  }
}
const execute = async (slug, data, options) => __composioAttachPrompt(__composioUnwrap(await __composioHelper('execute', [slug, data === undefined ? {} : data, options === undefined ? {} : options])));
const search = async (query, options) => __composioAttachPrompt(__composioUnwrap(await __composioHelper('search', [query, options === undefined ? {} : options])));
const proxy = async (toolkit) => {
  const session = __composioUnwrap(await __composioHelper('proxy', [toolkit]));
  const proxyFetch = async (input, init) => {
    const request = input instanceof URL ? input.toString() : input;
    return __composioUnwrap(await __composioProxyFetch(session.handle, request, init === undefined ? {} : init));
  };
  Object.defineProperty(proxyFetch, 'toolkit', { value: session.toolkit });
  return proxyFetch;
};
Object.defineProperty(proxy, 'schema', { value: __composioProxySchema });
const experimental_subAgent = async () => { throw new Error(__composioRemovedSubAgentMessage); };
const invokeAgent = experimental_subAgent;
const z = (() => {
  const handle = (value) => {
    if (value === null || typeof value !== 'object' || typeof value.__zid !== 'number') return value;
    const schema = { __zid: value.__zid };
    for (const method of value.__zmethods) {
      schema[method] = (...args) => {
        const result = handle(call(value.__zid, method, args));
        if (method === 'safeParse' && result !== null && typeof result === 'object' && result.success === false) {
          result.error = new ZodError(result.error.message, result.error.issues);
        }
        return result;
      };
    }
    return schema;
  };
  const call = (id, method, args) => {
    if (args.some((arg) => typeof arg === 'function')) {
      throw new TypeError('z: ' + method + '() with a callback is not supported in composio run. Validate the parsed value in your own code instead.');
    }
    return __composioUnwrap(__composioZod(id, method, args));
  };
  const namespace = { ZodError };
  for (const name of __composioZodKeys.root) namespace[name] = (...args) => handle(call(0, name, args));
  for (const group of Object.keys(__composioZodKeys.groups)) {
    namespace[group] = {};
    for (const name of __composioZodKeys.groups[group]) namespace[group][name] = (...args) => handle(call(0, group + '.' + name, args));
  }
  return namespace;
})();
const __composioEnd = () => {
  if (__composioExiting) return;
  __composioRunExitListeners('beforeExit', process.exitCode === undefined ? 0 : process.exitCode);
  __composioExiting = true;
  __composioRunExitListeners('exit', process.exitCode === undefined ? 0 : process.exitCode);
};
const zod = z;
const __composioRunContext = __composioContext.run;
const __composioConsumerContext = __composioContext.consumer;
const globalThis = {
  console, process, setTimeout, setInterval, clearTimeout, clearInterval, setImmediate, clearImmediate,
  queueMicrotask, fetch, Blob, File, execute, search, proxy, experimental_subAgent, invokeAgent, z, zod,
  __composioRunContext, __composioConsumerContext,
};
`;

/** The prelude as one line, which the user's script follows on the same line. */
export const RUN_SCRIPT_PRELUDE = PRELUDE_SOURCE.split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)
  .join(' ');
