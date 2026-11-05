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
// Locks live outside the task namespace so no task id can collide with them.
const locksRoot = path.join(root, '.artifacts/agent-locks');
const logHeadLimit = 16 * 1024;
const logTailLimit = 48 * 1024;
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

const taskIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function taskDirectory(id: string) {
  if (!taskIdPattern.test(id ?? ''))
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

// Attempts are numbered under the worktree lock, so their order does not depend on the clock.
const attemptNumber = (name: string) => Number.parseInt(name, 10);
function latestAttempt(directory: string) {
  const attempts = path.join(directory, 'attempts');
  return fs.existsSync(attempts)
    ? fs
        .readdirSync(attempts)
        .filter(name => Number.isSafeInteger(attemptNumber(name)))
        .sort((a, b) => attemptNumber(a) - attemptNumber(b))
        .at(-1)
    : undefined;
}

function latestReceipt(directory: string): StoredReceipt | null {
  const attempts = path.join(directory, 'attempts');
  const latest = latestAttempt(directory);
  if (!latest) return null;
  const file = path.join(attempts, latest, 'receipt.json');
  return fs.existsSync(file)
    ? { file, ...readJSON<Receipt>(file) }
    : { file, id: latest, status: 'interrupted' };
}

function taskIds() {
  return fs.existsSync(tasksRoot)
    ? fs
        .readdirSync(tasksRoot)
        .filter(
          name =>
            taskIdPattern.test(name) &&
            fs.statSync(path.join(tasksRoot, name), { throwIfNoEntry: false })?.isDirectory()
        )
        .sort()
    : [];
}

function readLockOwner(file: string): LockOwner | null {
  let owner: Partial<LockOwner> | null;
  try {
    owner = readJSON<Partial<LockOwner> | null>(file);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  return typeof owner?.pid === 'number' &&
    Number.isSafeInteger(owner.pid) &&
    owner.pid > 0 &&
    typeof owner.task === 'string' &&
    taskIdPattern.test(owner.task)
    ? { pid: owner.pid, task: owner.task }
    : null;
}

// A command saved without a pid may have started before its runner died, so its group is unknown.
function commandGroupBlocker(receipt: StoredReceipt | null) {
  const command = receipt?.commands?.at(-1);
  if (!command) return null;
  if (command.pid === undefined && !command.finishedAt)
    return `command \`${command.argv.join(' ')}\` has no recorded process group and may still be running. Stop any process it started, then remove the lock`;
  return alive(command.pid ? processGroup(command.pid) : undefined)
    ? `command group ${command.pid} remains. Inspect and stop that group before retrying`
    : null;
}

const groupAlive = (pid: number) => alive(processGroup(pid));
const signalGroup = (pid: number, signal: NodeJS.Signals) => {
  try {
    process.kill(processGroup(pid), signal);
  } catch (error) {
    if (errorCode(error) !== 'ESRCH') throw error;
  }
};

// A command can exit while workers it started keep running and writing shared outputs.
async function endGroup(pid: number) {
  for (const [signal, grace] of [
    ['SIGTERM', 1500],
    ['SIGKILL', 5000],
  ] as const) {
    if (!groupAlive(pid)) return;
    signalGroup(pid, signal);
    for (let waited = 0; waited < grace && groupAlive(pid); waited += 25) await Bun.sleep(25);
  }
  if (groupAlive(pid)) throw new Error(`Command group ${pid} survived SIGKILL.`);
}

// Without a readable owner, only the attempts themselves can show that verification is still live.
function assertNoLiveAttempt(file: string) {
  for (const id of taskIds()) {
    let receipt: StoredReceipt | null;
    try {
      receipt = latestReceipt(taskDirectory(id));
    } catch {
      continue;
    }
    if (receipt?.status !== 'running') continue;
    if (alive(receipt.runnerPid) || commandGroupBlocker(receipt))
      throw new Error(
        `${file} is unreadable and task ${id} still has a running attempt (runner ${receipt.runnerPid}); inspect ${receipt.file} before retrying.`
      );
  }
}

function lockTask(task: string) {
  const file = path.join(locksRoot, 'verify.lock');
  const acquisitionFile = path.join(locksRoot, 'acquire.lock');
  fs.mkdirSync(locksRoot, { recursive: true, mode: 0o700 });
  const acquisition = fs.openSync(acquisitionFile, 'wx', 0o600);
  try {
    fs.writeFileSync(acquisition, String(process.pid));
    const owner = fs.existsSync(file) ? readLockOwner(file) : undefined;
    if (owner === null) {
      assertNoLiveAttempt(file);
      console.error(`Replacing unreadable lock ${file}; no task attempt is still running.`);
      fs.unlinkSync(file);
    } else if (owner) {
      if (alive(owner.pid))
        throw new Error(
          `Worktree verification is owned by task ${owner.task} (runner ${owner.pid}); inspect ${file} before retrying.`
        );
      const previous = latestReceipt(taskDirectory(owner.task));
      const blocker = commandGroupBlocker(previous);
      if (blocker)
        throw new Error(
          `Runner ${owner.pid} ended but its ${blocker}. Lock: ${file}. Receipt: ${previous?.file}.`
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

// Claude Code rewrites this tracked file while sessions run; it is not a verification input.
const volatilePaths = ['.claude/scheduled_tasks.lock'];

function subject() {
  const hash = createHash('sha256');
  const addTree = (cwd: string, prefix = '') => {
    const pathspec = prefix ? [] : ['--', '.', ...volatilePaths.map(file => `:(exclude)${file}`)];
    hash.update(git(['ls-files', '--stage', '-z', ...pathspec], cwd));
    const names = new Set(
      git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', ...pathspec], cwd)
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
  const attempt = String(attemptNumber(latestAttempt(directory) ?? '0') + 1);
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
  // The log keeps the start and end of combined output; late failures matter most.
  let logHead = 0;
  const logTail: Buffer[] = [];
  let logTailBytes = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const flushLog = () => {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    if (logBytes === logHead) return;
    const tail = Buffer.concat(logTail).subarray(-logTailLimit);
    const omitted = logBytes - logHead - tail.length;
    const head = fs.readFileSync(logFile).subarray(0, logHead);
    const marker = omitted > 0 ? `\n[agent-task: ${omitted} bytes of output omitted]\n` : '';
    fs.writeFileSync(logFile, Buffer.concat([head, Buffer.from(marker), tail]));
  };
  const stop = (signal: NodeJS.Signals) => {
    interrupted = signal;
    if (!child?.pid || cancellation) return;
    const pid = child.pid;
    signalGroup(pid, signal);
    cancellation = new Promise<void>(resolve =>
      setTimeout(() => {
        // Once the command closes, its group id may be reused; endGroup owns any stragglers.
        if (child?.pid === pid) signalGroup(pid, 'SIGKILL');
        resolve();
      }, 1500)
    );
  };
  // A closed terminal sends SIGHUP; detached command groups would otherwise outlive the runner.
  const stopSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
  for (const signal of stopSignals) process.on(signal, stop);
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
          logBytes += chunk.length;
          const head = chunk.subarray(0, logHeadLimit - logHead);
          if (head.length > 0) {
            fs.appendFileSync(logFile, head);
            logHead += head.length;
          }
          if (head.length === chunk.length) return;
          logTail.push(Buffer.from(chunk.subarray(head.length)));
          logTailBytes += chunk.length - head.length;
          while (logTailBytes - logTail[0]!.length >= logTailLimit)
            logTailBytes -= logTail.shift()!.length;
          // Save the tail while the command runs so a killed runner keeps recent diagnostics.
          flushTimer ??= setTimeout(() => {
            try {
              flushLog();
            } catch {}
          }, 250);
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
      // Interrupts stop targeting the group here; endGroup signals it only while it still has members.
      child = undefined;
      if (result.pid) await endGroup(result.pid);
      result.finishedAt = now();
      flushLog();
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
    // Release the worktree only once the last command group is gone. A finished command's group
    // was already ended, and its id may since belong to an unrelated process group.
    let groupEnded = true;
    const last = receipt.commands.at(-1);
    if (last?.pid && !last.finishedAt)
      await endGroup(last.pid).catch((error: unknown) => {
        groupEnded = false;
        receipt.status = 'failed';
        receipt.error ??= errorMessage(error);
      });
    receipt.finishedAt = now();
    receipt.logTruncated = logBytes > logHeadLimit + logTailLimit;
    try {
      flushLog();
    } catch (error) {
      receipt.error ??= `Could not write the output log: ${errorMessage(error)}`;
    }
    try {
      if (fs.existsSync(attemptDirectory)) writeJSON(receiptFile, receipt);
    } finally {
      if (groupEnded) fs.unlinkSync(lock);
      for (const signal of stopSignals) process.off(signal, stop);
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
      // Publish the task folder in one rename so an interrupted init leaves no partial task.
      // An empty folder left by an older interrupted init is replaced; a real task is kept.
      const staging = path.join(tasksRoot, `.init-${randomUUID()}`);
      fs.mkdirSync(staging, { recursive: true, mode: 0o700 });
      try {
        writeJSON(path.join(staging, 'task.json'), task);
        fs.renameSync(staging, directory);
      } catch (error) {
        fs.rmSync(staging, { recursive: true, force: true });
        if (errorCode(error) === 'ENOTEMPTY' || errorCode(error) === 'EEXIST')
          throw new Error(`Task ${id} already exists.`);
        throw error;
      }
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
    print(
      taskIds().map(id => {
        try {
          return status(id);
        } catch (error) {
          return { id, status: 'unreadable', error: errorMessage(error) };
        }
      })
    );
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
