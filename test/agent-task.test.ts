import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'bun:test';
import { setTimeout as delay } from 'node:timers/promises';

interface TaskStatus {
  task: { goal: string; nextStep: string | null; blocker: string | null; authority: string };
  status: string;
  receipt: string;
}
type Fixture = ReturnType<typeof fixture>;

const script = new URL('../scripts/agent-task.ts', import.meta.url);
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

const fixture = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'composio-agent-task-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'scripts'));
  copyFileSync(script, path.join(root, 'scripts/agent-task.ts'));
  symlinkSync(new URL('../node_modules', import.meta.url), path.join(root, 'node_modules'), 'dir');
  writeFileSync(path.join(root, '.gitignore'), '.artifacts/\nnode_modules\n');
  writeFileSync(path.join(root, 'source.txt'), 'original');
  const profiles = {
    offline: {
      boundary: 'offline',
      commands: [{ cwd: '.', argv: [process.execPath, '-e', 'console.log("verified")'] }],
    },
    failure: {
      boundary: 'offline',
      commands: [
        {
          cwd: '.',
          argv: [
            process.execPath,
            '-e',
            'process.exit(require("fs").existsSync(".artifacts/succeed") ? 0 : 7)',
          ],
        },
        { cwd: '.', argv: [process.execPath, '-e', 'console.log("second")'] },
      ],
    },
    missing: {
      boundary: 'offline',
      commands: [{ cwd: '.', argv: ['composio-test-missing-executable'] }],
    },
    mutating: {
      boundary: 'offline',
      commands: [
        {
          cwd: '.',
          argv: [
            process.execPath,
            '-e',
            'require("fs").writeFileSync("source.txt", "changed during verification")',
          ],
        },
      ],
    },
    interrupt: {
      boundary: 'offline',
      commands: [
        {
          cwd: '.',
          argv: [
            process.execPath,
            '-e',
            'const child=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"});require("fs").writeFileSync(".artifacts/child.pid",String(child.pid));setInterval(()=>{},1000)',
          ],
        },
      ],
    },
  };
  writeFileSync(path.join(root, 'scripts/agent-profiles.json'), JSON.stringify(profiles));
  for (const args of [
    ['init', '-q'],
    ['add', '.'],
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline'],
  ]) {
    execFileSync('git', args, { cwd: root });
  }
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['scripts/agent-task.ts', ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  const state = (id: string): TaskStatus => JSON.parse(run('status', id).stdout);
  const init = (id = 'case', profile = 'offline') =>
    run(
      'init',
      id,
      '--goal',
      'Verify the changed behavior',
      '--profile',
      profile,
      '--authority',
      'local verification only'
    );
  return { root, run, state, init };
};

async function runningFixture(f: Fixture) {
  assert.equal(f.init('case', 'interrupt').status, 0);
  const runner = spawn(process.execPath, ['scripts/agent-task.ts', 'verify', 'case'], {
    cwd: f.root,
    stdio: 'ignore',
  });
  const exit = new Promise(resolve =>
    runner.on('exit', (code, signal) => resolve({ code, signal }))
  );
  cleanups.push(() => runner.kill('SIGKILL'));
  const file = path.join(f.root, '.artifacts/child.pid');
  for (let i = 0; i < 100 && !existsSync(file); i++) await delay(20);
  const childPid = Number(readFileSync(file, 'utf8'));
  const receipt = JSON.parse(readFileSync(path.join(f.root, f.state('case').receipt), 'utf8'));
  const group = receipt.commands[0].pid;
  cleanups.push(() => {
    try {
      process.kill(-group, 'SIGKILL');
    } catch {}
  });
  return { runner, exit, childPid, group };
}

async function waitGone(pid: number) {
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code === 'ESRCH') return;
      assert.equal(code, 'EPERM');
    }
    await delay(20);
  }
  assert.fail(`Process ${pid} did not stop`);
}

function useOfflineProfile(f: Fixture) {
  const file = path.join(f.root, 'scripts/agent-profiles.json');
  const profiles = JSON.parse(readFileSync(file, 'utf8'));
  profiles.interrupt.commands = profiles.offline.commands;
  writeFileSync(file, JSON.stringify(profiles));
}

test('CLI help describes commands and required initialization inputs without creating a task', () => {
  const f = fixture();
  const rootHelp = f.run('--help');
  assert.equal(rootHelp.status, 0, rootHelp.stderr);
  assert.match(rootHelp.stdout, /init/);
  assert.match(rootHelp.stdout, /verify/);
  const initHelp = f.run('init', '--help');
  assert.equal(initHelp.status, 0, initHelp.stderr);
  assert.match(initHelp.stdout, /--goal/);
  assert.match(initHelp.stdout, /--profile/);
  assert.equal(existsSync(path.join(f.root, '.artifacts/agent-tasks')), false);
});

test('invalid CLI inputs fail before creating task state', () => {
  const f = fixture();
  const missing = f.run('init', 'case', '--profile', 'offline');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /goal/i);
  const unknown = f.run(
    'init',
    'case',
    '--goal',
    'Check behavior',
    '--profile',
    'offline',
    '--bogus'
  );
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /bogus/i);
  const completions = f.run('--completions', 'nope');
  assert.equal(completions.status, 1);
  assert.match(completions.stderr, /nope/);
  const duplicate = f.run(
    'init',
    'case',
    '--goal',
    'A goal',
    '--profile',
    'offline',
    '--profile',
    'failure'
  );
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /profile/);
  const authority = f.run(
    'init',
    'case',
    '--goal',
    'A goal',
    '--profile',
    'offline',
    '--authority',
    'First scope',
    '--authority',
    'Other scope'
  );
  assert.equal(authority.status, 1);
  assert.match(authority.stderr, /authority/);
  assert.equal(existsSync(path.join(f.root, '.artifacts/agent-tasks')), false);
});

test('dash-leading task text is saved literally instead of activating built-in flags', () => {
  const f = fixture();
  assert.equal(
    f.run(
      'init',
      'case',
      '--goal',
      '- Fix the CLI',
      '--profile',
      'offline',
      '--authority',
      '- No merge'
    ).status,
    0
  );
  assert.equal(existsSync(path.join(f.root, '.artifacts/agent-tasks/case/task.json')), true);
  assert.equal(f.state('case').task.goal, '- Fix the CLI');
  assert.equal(f.state('case').task.authority, '- No merge');
});

test('task context survives a fresh invocation and duplicate init preserves it', () => {
  const f = fixture();
  assert.equal(f.init().status, 0);
  const task = f.state('case').task;
  assert.equal(task.goal, 'Verify the changed behavior');
  assert.equal(task.authority, 'local verification only');
  assert.equal(f.init().status, 1);
  assert.deepEqual(f.state('case').task, task);
  assert.equal(f.state('case').status, 'pending');
  assert.equal(JSON.parse(f.run('list').stdout)[0].task.id, 'case');
});

test('successful profile evidence expires after dirty edits, untracked sources, or task changes', () => {
  const f = fixture();
  assert.equal(f.init().status, 0);
  assert.equal(f.run('verify', 'case').status, 0);
  assert.equal(f.state('case').status, 'passed');
  writeFileSync(path.join(f.root, 'source.txt'), 'changed without a commit');
  assert.equal(f.state('case').status, 'stale');
  assert.equal(f.run('verify', 'case').status, 0);
  assert.equal(f.state('case').status, 'passed');
  writeFileSync(path.join(f.root, 'new-source.txt'), 'new input');
  assert.equal(f.state('case').status, 'stale');
  assert.equal(f.run('verify', 'case').status, 0);
  const taskPath = path.join(f.root, '.artifacts/agent-tasks/case/task.json');
  const task = JSON.parse(readFileSync(taskPath, 'utf8'));
  task.goal = 'A different acceptance outcome';
  writeFileSync(taskPath, JSON.stringify(task));
  assert.equal(f.state('case').status, 'stale');
});

test('changed profiles invalidate receipts and failed attempts survive later success', () => {
  const f = fixture();
  assert.equal(f.init('case', 'failure').status, 0);
  assert.equal(f.run('verify', 'case').status, 1);
  assert.equal(f.state('case').status, 'failed');
  const attempts = path.join(f.root, '.artifacts/agent-tasks/case/attempts');
  const first = readdirSync(attempts)[0];
  const failed = readFileSync(path.join(attempts, first, 'receipt.json'), 'utf8');
  writeFileSync(path.join(f.root, '.artifacts/succeed'), 'ready');
  assert.equal(f.run('verify', 'case').status, 0);
  assert.equal(f.state('case').status, 'passed');
  assert.equal(readdirSync(attempts).length, 2);
  assert.equal(readFileSync(path.join(attempts, first, 'receipt.json'), 'utf8'), failed);
  const profilesPath = path.join(f.root, 'scripts/agent-profiles.json');
  const profiles = JSON.parse(readFileSync(profilesPath, 'utf8'));
  profiles.failure.boundary = 'packaged';
  writeFileSync(profilesPath, JSON.stringify(profiles));
  assert.equal(f.state('case').status, 'stale');
});

test('handoff progress notes preserve proof without changing its acceptance contract', () => {
  const f = fixture();
  assert.equal(f.init().status, 0);
  assert.equal(f.run('verify', 'case').status, 0);
  const taskPath = path.join(f.root, '.artifacts/agent-tasks/case/task.json');
  const task = JSON.parse(readFileSync(taskPath, 'utf8'));
  task.nextStep = 'Review the verified diff';
  task.blocker = 'Waiting for an owner decision';
  writeFileSync(taskPath, JSON.stringify(task));
  assert.equal(f.state('case').status, 'passed');
  assert.equal(f.state('case').task.nextStep, task.nextStep);
});

test('an unfinished newer attempt cannot expose an older passing receipt', () => {
  const f = fixture();
  assert.equal(f.init().status, 0);
  assert.equal(f.run('verify', 'case').status, 0);
  mkdirSync(path.join(f.root, '.artifacts/agent-tasks/case/attempts/9999999999999-incomplete'));
  assert.equal(f.state('case').status, 'interrupted');
});

test('a killed runner exposes interrupted evidence and a recoverable lock', async () => {
  const f = fixture();
  const { runner, exit, group } = await runningFixture(f);
  runner.kill('SIGKILL');
  assert.deepEqual(await Promise.race([exit, delay(5000, 'timed out', { ref: false })]), {
    code: null,
    signal: 'SIGKILL',
  });
  assert.equal(f.state('case').status, 'interrupted');
  const blocked = f.run('verify', 'case');
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /Inspect and stop that group/);
  process.kill(-group, 'SIGKILL');
  await waitGone(-group);
  useOfflineProfile(f);
  assert.equal(f.run('verify', 'case').status, 0);
  assert.equal(f.state('case').status, 'passed');
});

test('missing tools fail and preserve an attempted command receipt', () => {
  const f = fixture();
  assert.equal(f.init('case', 'missing').status, 0);
  assert.equal(f.run('verify', 'case').status, 1);
  assert.equal(f.state('case').status, 'failed');
  const attempts = path.join(f.root, '.artifacts/agent-tasks/case/attempts');
  const receipt = JSON.parse(
    readFileSync(path.join(attempts, readdirSync(attempts)[0], 'receipt.json'), 'utf8')
  );
  assert.equal(receipt.commands.length, 1);
  assert.notEqual(receipt.commands[0].exitCode, 0);
});

test('a successful command that edits its verification subject cannot establish fresh proof', () => {
  const f = fixture();
  assert.equal(f.init('case', 'mutating').status, 0);
  assert.equal(f.run('verify', 'case').status, 1);
  assert.equal(f.state('case').status, 'stale');
});

test('interruption terminates the command group, preserves evidence and releases the task for retry', async () => {
  const f = fixture();
  const { runner, exit, childPid } = await runningFixture(f);
  runner.kill('SIGTERM');
  assert.deepEqual(await Promise.race([exit, delay(5000, 'timed out', { ref: false })]), {
    code: 1,
    signal: null,
  });
  assert.equal(f.state('case').status, 'interrupted');
  await waitGone(childPid);
  useOfflineProfile(f);
  assert.equal(f.run('verify', 'case').status, 0);
  assert.equal(f.state('case').status, 'passed');
});

test('verification remains locked until independent-stdio descendants stop', async () => {
  const f = fixture();
  const file = path.join(f.root, 'scripts/agent-profiles.json');
  const profiles = JSON.parse(readFileSync(file, 'utf8'));
  const descendant = 'process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000)';
  profiles.interrupt.commands[0].argv[2] = `
    const child = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.once('data', () => require('fs').writeFileSync('.artifacts/child.pid', String(child.pid)));
    process.on('SIGTERM', () => process.exit(0));
    setInterval(() => {}, 1000);
  `;
  writeFileSync(file, JSON.stringify(profiles));
  const { runner, exit, childPid, group } = await runningFixture(f);
  assert.equal(f.init('other').status, 0);
  runner.kill('SIGTERM');
  await waitGone(group);
  process.kill(childPid, 0);
  assert.equal(existsSync(path.join(f.root, '.artifacts/agent-tasks/verify.lock')), true);
  const overlap = f.run('verify', 'other');
  assert.equal(
    overlap.status,
    1,
    'the lock must outlive the direct command until its descendants stop'
  );
  assert.match(overlap.stderr, /case/);
  assert.deepEqual(await Promise.race([exit, delay(5000, 'timed out', { ref: false })]), {
    code: 1,
    signal: null,
  });
  await waitGone(childPid);
  assert.equal(f.state('case').status, 'interrupted');
});

test('different task profiles serialize shared worktree verification', async () => {
  const f = fixture();
  const { runner, exit } = await runningFixture(f);
  assert.equal(f.init('other').status, 0);
  try {
    const overlap = f.run('verify', 'other');
    assert.equal(overlap.status, 1, 'a different task must not overlap worktree verification');
    assert.match(overlap.stderr, /case/);
  } finally {
    runner.kill('SIGTERM');
    await exit;
  }
  assert.equal(f.run('verify', 'other').status, 0);
});

test('a revision-only change invalidates otherwise identical source evidence', () => {
  const f = fixture();
  assert.equal(f.init().status, 0);
  assert.equal(f.run('verify', 'case').status, 0);
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'new revision',
    ],
    { cwd: f.root }
  );
  assert.equal(f.state('case').status, 'stale');
});
