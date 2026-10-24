#!/usr/bin/env bun
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { Effect, Option, Runtime } from 'effect';
import { Argument, Command as CliCommand, Flag } from 'effect/cli';
import * as BunServices from '@effect/platform-bun/BunServices';

type State = 'pending' | 'running' | 'passed' | 'failed' | 'interrupted' | 'stale';
interface Command {
  cwd: string;
  argv: string[];
}
interface Profile {
  boundary: string;
  commands: Command[];
}
interface Task {
  version: number;
  id: string;
  goal: string;
  profile: string;
  source: string | null;
  authority: string | null;
  nextStep: string | null;
  blocker: string | null;
  createdAt: string;
}
interface Subject {
  head: string;
  fingerprint: string;
}
interface CommandResult extends Command {
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  pid?: number | null;
  error?: string;
}
interface Receipt {
  version: number;
  id: string;
  runnerPid: number;
  startedAt: string;
  finishedAt: string | null;
  status: State;
  taskDigest: string;
  profileDigest: string;
  subject: Subject | null;
  boundary: string;
  commands: CommandResult[];
  bunVersion: string;
  error?: string;
  logTruncated?: boolean;
}
type StoredReceipt = Partial<Receipt> & Pick<Receipt, 'id' | 'status'> & { file: string };
interface LockOwner {
  pid: number;
  task: string;
}
const errorCode = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const root = path.resolve(import.meta.dir, '..');
const tasksRoot = path.join(root, '.artifacts/agent-tasks');
const logLimit = 64 * 1024;
const readJSON = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(value) ?? 'null')
    .digest('hex');
const taskDigest = ({ version, id, goal, profile, source, authority }: Task) =>
  digest({ version, id, goal, profile, source, authority });
const now = () => new Date().toISOString();
const processGroup = (pid: number) => (process.platform === 'win32' ? pid : -pid);
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const git = (args: string[], cwd = root) =>
  execFileSync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
const writeJSON = (file: string, value: unknown) => {
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
};

function taskDirectory(id: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id ?? ''))
    throw new Error(
      'Use a task id of 1-64 letters, digits, dots, underscores or hyphens, starting with a letter or digit.'
    );
  return path.join(tasksRoot, id);
}

function profileFor(task: Task) {
  const profile = readJSON<Record<string, Profile>>(path.join(root, 'scripts/agent-profiles.json'))[
    task.profile
  ];
  if (
    !profile ||
    typeof profile.boundary !== 'string' ||
    !Array.isArray(profile.commands) ||
    profile.commands.length === 0
  )
    throw new Error(`Unknown or empty profile: ${task.profile}`);
  for (const command of profile.commands) {
    if (
      !Array.isArray(command.argv) ||
      command.argv.length === 0 ||
      command.argv.some(arg => typeof arg !== 'string') ||
      typeof command.cwd !== 'string'
    )
      throw new Error('Profiles require cwd and a nonempty argv array.');
    const relative = path.relative(root, path.resolve(root, command.cwd));
    if (relative.startsWith('..') || path.isAbsolute(relative))
      throw new Error('Profile cwd must stay inside the repository.');
  }
  return profile;
}

function alive(pid: number | null | undefined) {
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid === 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ESRCH') return false;
    if (errorCode(error) === 'EPERM') return true;
    throw error;
  }
}

function latestReceipt(directory: string): StoredReceipt | null {
  const attempts = path.join(directory, 'attempts');
  const latest = fs.existsSync(attempts) ? fs.readdirSync(attempts).sort().at(-1) : null;
  if (!latest) return null;
  const file = path.join(attempts, latest, 'receipt.json');
  return fs.existsSync(file)
    ? { file, ...readJSON<Receipt>(file) }
    : { file, id: latest, status: 'interrupted' };
}

function lockTask(task: string) {
  const file = path.join(tasksRoot, 'verify.lock');
  const acquisitionFile = path.join(tasksRoot, 'acquire.lock');
  const acquisition = fs.openSync(acquisitionFile, 'wx', 0o600);
  try {
    fs.writeFileSync(acquisition, String(process.pid));
    if (fs.existsSync(file)) {
      const owner = readJSON<LockOwner>(file);
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || alive(owner.pid))
        throw new Error(
          `Worktree verification is owned by task ${owner.task} (runner ${owner.pid}); inspect ${file} before retrying.`
        );
      const previous = latestReceipt(taskDirectory(owner.task));
      const command = previous?.status === 'running' ? previous.commands?.at(-1) : null;
      if (alive(command?.pid ? processGroup(command.pid) : undefined))
        throw new Error(
          `Runner ${owner.pid} ended but command group ${command?.pid} remains. Inspect and stop that group before retrying; its receipt is ${previous?.file}.`
        );
      fs.unlinkSync(file);
    }
    const handle = fs.openSync(file, 'wx', 0o600);
    try {
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, task }));
    } catch (error) {
      fs.unlinkSync(file);
      throw error;
    } finally {
      fs.closeSync(handle);
    }
    return file;
  } finally {
    fs.closeSync(acquisition);
    fs.unlinkSync(acquisitionFile);
  }
}

function subject() {
  const hash = createHash('sha256');
  const addTree = (cwd: string, prefix = '') => {
    hash.update(git(['ls-files', '--stage', '-z'], cwd));
    const names = new Set(
      git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd)
        .toString()
        .split('\0')
        .filter(Boolean)
    );
    for (const name of [...names].sort()) {
      hash.update(`${prefix}${name}\0`);
      const file = path.join(cwd, name);
      try {
        const stat = fs.lstatSync(file);
        hash.update(`${stat.mode}\0`);
        if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(file));
        else if (stat.isFile()) hash.update(fs.readFileSync(file));
        else if (stat.isDirectory() && fs.existsSync(path.join(file, '.git')))
          addTree(file, `${prefix}${name}/`);
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error;
        hash.update('deleted');
      }
      hash.update('\0');
    }
  };
  addTree(root);
  return { head: git(['rev-parse', 'HEAD']).toString().trim(), fingerprint: hash.digest('hex') };
}

function status(id: string) {
  const directory = taskDirectory(id);
  const task = readJSON<Task>(path.join(directory, 'task.json'));
  const receipt = latestReceipt(directory);
  let state = receipt?.status ?? 'pending';
  if (state === 'running' && receipt && !alive(receipt.runnerPid)) state = 'interrupted';
  if (state === 'passed' && receipt) {
    const profile = profileFor(task);
    const complete =
      receipt.commands?.length === profile.commands.length &&
      receipt.commands.every(command => command.exitCode === 0 && command.finishedAt);
    state =
      complete &&
      receipt.taskDigest === taskDigest(task) &&
      receipt.profileDigest === digest(profile) &&
      digest(receipt.subject) === digest(subject())
        ? 'passed'
        : 'stale';
  }
  return {
    task,
    status: state,
    boundary: receipt?.boundary ?? profileFor(task).boundary,
    receipt: receipt ? path.relative(root, receipt.file) : null,
  };
}

async function verify(id: string) {
  const directory = taskDirectory(id);
  const task = readJSON<Task>(path.join(directory, 'task.json'));
  const profile = profileFor(task);
  const lock = lockTask(id);
  const attempt = `${Date.now()}-${randomUUID()}`;
  const attemptDirectory = path.join(directory, 'attempts', attempt);
  const receiptFile = path.join(attemptDirectory, 'receipt.json');
  const receipt: Receipt = {
    version: 1,
    id: attempt,
    runnerPid: process.pid,
    startedAt: now(),
    finishedAt: null,
    status: 'running',
    taskDigest: taskDigest(task),
    profileDigest: digest(profile),
    subject: null,
    boundary: profile.boundary,
    commands: [],
    bunVersion: Bun.version,
  };
  let child: ChildProcessByStdio<null, Readable, Readable> | undefined;
  let cancellation: Promise<void> | undefined;
  let interrupted: NodeJS.Signals | undefined;
  let logBytes = 0;
  const killChild = (signal: NodeJS.Signals, pid: number) => {
    try {
      process.kill(processGroup(pid), signal);
    } catch (error) {
      if (errorCode(error) !== 'ESRCH') throw error;
    }
  };
  const stop = (signal: NodeJS.Signals) => {
    interrupted = signal;
    if (!child?.pid || cancellation) return;
    const pid = child.pid;
    killChild(signal, pid);
    cancellation = new Promise<void>(resolve =>
      setTimeout(() => {
        killChild('SIGKILL', pid);
        resolve();
      }, 1500)
    );
  };
  const onInterrupt = () => stop('SIGINT');
  const onTerminate = () => stop('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  const logFile = path.join(attemptDirectory, 'output.log');
  try {
    fs.mkdirSync(attemptDirectory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(logFile, '', { mode: 0o600 });
    writeJSON(receiptFile, receipt);
    receipt.subject = subject();
    writeJSON(receiptFile, receipt);
    for (const command of profile.commands) {
      if (interrupted) break;
      const result: CommandResult = {
        ...command,
        startedAt: now(),
        finishedAt: null,
        exitCode: null,
        signal: null,
      };
      receipt.commands.push(result);
      writeJSON(receiptFile, receipt);
      await new Promise<void>(resolve => {
        child = spawn(command.argv[0], command.argv.slice(1), {
          cwd: path.resolve(root, command.cwd),
          shell: false,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        result.pid = child.pid ?? null;
        writeJSON(receiptFile, receipt);
        const output = (chunk: Uint8Array) => {
          process.stderr.write(chunk);
          const remaining = Math.max(0, logLimit - logBytes);
          if (remaining > 0) fs.appendFileSync(logFile, chunk.subarray(0, remaining));
          logBytes += chunk.length;
        };
        child.stdout.on('data', output);
        child.stderr.on('data', output);
        child.on('error', error => {
          result.error = error.message;
        });
        child.on('close', (code, signal) => {
          result.exitCode = code;
          result.signal = signal;
          resolve();
        });
      });
      result.finishedAt = now();
      writeJSON(receiptFile, receipt);
      if (result.exitCode !== 0 || result.error) break;
    }
    receipt.status = interrupted
      ? 'interrupted'
      : receipt.commands.length === profile.commands.length &&
          receipt.commands.every(command => command.exitCode === 0 && !command.error)
        ? 'passed'
        : 'failed';
    if (
      receipt.status === 'passed' &&
      (digest(receipt.subject) !== digest(subject()) ||
        receipt.taskDigest !== taskDigest(readJSON<Task>(path.join(directory, 'task.json'))) ||
        receipt.profileDigest !== digest(profileFor(task)))
    )
      receipt.status = 'stale';
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = errorMessage(error);
  } finally {
    await cancellation;
    receipt.finishedAt = now();
    receipt.logTruncated = logBytes > logLimit;
    try {
      if (fs.existsSync(attemptDirectory)) writeJSON(receiptFile, receipt);
    } finally {
      fs.unlinkSync(lock);
      process.off('SIGINT', onInterrupt);
      process.off('SIGTERM', onTerminate);
    }
  }
  print(status(id));
  if (receipt.status !== 'passed') process.exitCode = 1;
}

const taskId = Argument.String('id').pipe(Argument.withDescription('Local task identifier'));
const operation = (run: () => void | Promise<void>) =>
  Effect.tryPromise({ try: async () => run(), catch: (error: unknown) => error });
const stringFlag = (name: string) =>
  Flag.String(name).pipe(
    Flag.between(1, 1),
    Flag.map(values => values[0]!)
  );

const initFlags = {
  goal: stringFlag('goal').pipe(Flag.withDescription('Observable outcome to implement and verify')),
  profile: stringFlag('profile').pipe(
    Flag.withDescription('Check group from scripts/agent-profiles.json')
  ),
  source: stringFlag('source').pipe(
    Flag.withDescription('Original issue or PR URL'),
    Flag.optional
  ),
  authority: stringFlag('authority').pipe(
    Flag.withDescription('User-authorized scope to preserve as context'),
    Flag.optional
  ),
};
const initCommand = CliCommand.make(
  'init',
  { id: taskId, ...initFlags },
  ({ id, goal, profile, source, authority }) =>
    operation(() => {
      if (!goal.trim() || !profile)
        throw new Error('Task initialization requires --goal and --profile.');
      const directory = taskDirectory(id);
      const task: Task = {
        version: 1,
        id,
        goal,
        profile,
        source: Option.getOrNull(source),
        authority: Option.getOrNull(authority),
        nextStep: null,
        blocker: null,
        createdAt: now(),
      };
      profileFor(task);
      fs.mkdirSync(tasksRoot, { recursive: true, mode: 0o700 });
      fs.mkdirSync(directory, { mode: 0o700 });
      writeJSON(path.join(directory, 'task.json'), task);
      print(status(id));
    })
).pipe(
  CliCommand.withDescription('Save a task goal and select its verification checks'),
  CliCommand.withExamples([
    {
      command:
        'bun run agent:task init cli-fix --goal "Fix the reported CLI behavior" --profile cli',
      description: 'Start a CLI task',
    },
  ])
);
const statusCommand = CliCommand.make('status', { id: taskId }, ({ id }) =>
  operation(() => print(status(id)))
).pipe(
  CliCommand.withDescription('Read saved context and check whether verification is still current')
);
const verifyCommand = CliCommand.make('verify', { id: taskId }, ({ id }) =>
  operation(() => verify(id))
).pipe(CliCommand.withDescription('Run the selected checks and retain a revision-bound receipt'));
const listCommand = CliCommand.make('list', {}, () =>
  operation(() => {
    const ids = fs.existsSync(tasksRoot)
      ? fs
          .readdirSync(tasksRoot)
          .filter(name =>
            fs.statSync(path.join(tasksRoot, name), { throwIfNoEntry: false })?.isDirectory()
          )
      : [];
    print(ids.sort().map(status));
  })
).pipe(CliCommand.withDescription('List saved tasks and their verification status'));
const rootCommand = CliCommand.make('agent:task').pipe(
  CliCommand.withDescription('Preserve task context and run repository verification checks'),
  CliCommand.withSubcommands([initCommand, statusCommand, verifyCommand, listCommand]),
  CliCommand.withExamples([
    { command: 'bun run agent:task status cli-fix', description: 'Resume a saved task' },
    {
      command: 'bun run agent:task verify cli-fix',
      description: 'Verify the current revision after implementing the fix',
    },
  ])
);

function taskArguments(args: readonly string[]): string[] {
  const valueFlags = new Set(Object.keys(initFlags).map(name => `--${name}`));
  const result: string[] = [];
  const tokens = args[Symbol.iterator]();
  for (const token of tokens) {
    if (valueFlags.has(token)) {
      const value = tokens.next();
      result.push(value.done ? token : `${token}=${value.value}`);
    } else result.push(token);
  }
  return result;
}

// Bind literal values before Effect scans built-in flags, so task text cannot activate help.
// Verification owns signal cleanup so its command groups stop before the worktree lock is released.
Effect.runPromise(
  CliCommand.runWith(rootCommand, { version: '1' })(taskArguments(process.argv.slice(2))).pipe(
    Effect.provide(BunServices.layer),
    Effect.catchTags({
      ShowHelp: (error: unknown) =>
        Effect.sync(() => {
          process.exitCode = Runtime.getErrorExitCode(error);
        }),
      UserError: (error: unknown) =>
        Effect.sync(() => {
          process.exitCode = Runtime.getErrorExitCode(error);
        }),
    }),
    Effect.catch(error =>
      Effect.sync(() => {
        console.error(errorMessage(error));
        process.exitCode = Runtime.getErrorExitCode(error);
      })
    )
  )
).catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
