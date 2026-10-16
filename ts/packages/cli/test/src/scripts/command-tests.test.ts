import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkCommandTests,
  collectCommandTests,
  COMMAND_TEST_EXEMPTIONS,
  isGroupEntry,
  mirroredTestPath,
  resolveTestCommand,
} from '../../../scripts/command-tests';

const commands = [
  'login.cmd.ts',
  'logout/logout.cmd.ts',
  'setup.cmd.ts',
  'tools/tools.cmd.ts',
  'tools/commands/tools.execute.cmd.ts',
  'tools/list/tools.list.cmd.ts',
  'triggers/root-triggers.cmd.ts',
  'triggers/triggers.cmd.ts',
  'triggers/commands/triggers.create.cmd.ts',
];

const tests = [
  'login.cmd.test.ts',
  'logout/logout.cmd.test.ts',
  'setup.cmd.test.ts',
  'setup.telemetry.cmd.test.ts',
  'tools/tools.execute.cmd.test.ts',
  'tools/tools.execute.client.cmd.test.ts',
  'tools/list/tools.list.cmd.test.ts',
  'triggers/triggers.mutations.cmd.test.ts',
];

const exemptions = [
  {
    command: 'triggers/commands/triggers.create.cmd.ts',
    reason: 'covered by triggers.mutations.cmd.test.ts; split pending',
  },
];

describe('command test layout', () => {
  it('detects group entries by their parent directory holding other commands', () => {
    expect(isGroupEntry('tools/tools.cmd.ts', commands)).toBe(true);
    expect(isGroupEntry('triggers/root-triggers.cmd.ts', commands)).toBe(true);
    expect(isGroupEntry('triggers/triggers.cmd.ts', commands)).toBe(true);
    expect(isGroupEntry('login.cmd.ts', commands)).toBe(false);
    expect(isGroupEntry('tools/commands/tools.list.cmd.ts', commands)).toBe(false);
    expect(isGroupEntry('tools/list/tools.list.cmd.ts', commands)).toBe(false);
  });

  it('treats <name>/<name>.cmd.ts with nothing below it as a top-level command', () => {
    expect(isGroupEntry('logout/logout.cmd.ts', commands)).toBe(false);
    expect(mirroredTestPath('logout/logout.cmd.ts')).toBe('logout/logout.cmd.test.ts');
    expect(
      checkCommandTests({
        commands,
        tests: tests.filter(test => test !== 'logout/logout.cmd.test.ts'),
        exemptions,
      })
    ).toEqual([
      'missing test: src/commands/logout/logout.cmd.ts needs test/src/commands/logout/logout.cmd.test.ts.',
    ]);
  });

  it('mirrors both the legacy and the per-command directory layouts', () => {
    expect(mirroredTestPath('login.cmd.ts')).toBe('login.cmd.test.ts');
    expect(mirroredTestPath('tools/commands/tools.list.cmd.ts')).toBe(
      'tools/tools.list.cmd.test.ts'
    );
    expect(mirroredTestPath('tools/list/tools.list.cmd.ts')).toBe(
      'tools/list/tools.list.cmd.test.ts'
    );
    expect(mirroredTestPath('ts/commands/ts.generate.cmd.ts')).toBe('ts/ts.generate.cmd.test.ts');
  });

  it('resolves aspect-suffixed tests to the longest matching command prefix', () => {
    expect(resolveTestCommand('setup.telemetry.cmd.test.ts', commands)).toBe('setup.cmd.ts');
    expect(resolveTestCommand('tools/tools.execute.client.cmd.test.ts', commands)).toBe(
      'tools/commands/tools.execute.cmd.ts'
    );
    expect(resolveTestCommand('triggers/triggers.mutations.cmd.test.ts', commands)).toBe(
      'triggers/triggers.cmd.ts'
    );
    expect(resolveTestCommand('nope.cmd.test.ts', commands)).toBeUndefined();
  });

  it('passes when every command is tested or exempted', () => {
    expect(checkCommandTests({ commands, tests, exemptions })).toEqual([]);
  });

  it('reports a command without its mirrored test', () => {
    expect(
      checkCommandTests({
        commands,
        tests: tests.filter(test => test !== 'tools/list/tools.list.cmd.test.ts'),
        exemptions,
      })
    ).toEqual([
      'missing test: src/commands/tools/list/tools.list.cmd.ts needs test/src/commands/tools/list/tools.list.cmd.test.ts.',
    ]);
  });

  it('reports a test that matches no command', () => {
    expect(
      checkCommandTests({
        commands,
        tests: [...tests, 'agent/agent.claim.cmd.test.ts'],
        exemptions,
      })
    ).toEqual([
      'orphan test: test/src/commands/agent/agent.claim.cmd.test.ts matches no <prefix>.cmd.ts under src/commands/.',
    ]);
  });

  it('reports an exemption whose command now has its mirrored test', () => {
    expect(
      checkCommandTests({
        commands,
        tests: [...tests, 'triggers/triggers.create.cmd.test.ts'],
        exemptions,
      })
    ).toEqual([
      'stale exemption: triggers/commands/triggers.create.cmd.ts now has test/src/commands/triggers/triggers.create.cmd.test.ts; remove it from COMMAND_TEST_EXEMPTIONS.',
    ]);
  });

  it('reports an exemption for a command that no longer exists', () => {
    expect(
      checkCommandTests({
        commands,
        tests,
        exemptions: [...exemptions, { command: 'gone.cmd.ts', reason: 'no test yet' }],
      })
    ).toEqual([
      'stale exemption: gone.cmd.ts is not a command under src/commands/; remove it from COMMAND_TEST_EXEMPTIONS.',
    ]);
  });

  it('holds for the current package tree', () => {
    const packageRoot = path.resolve(import.meta.dirname, '../../..');
    expect(
      checkCommandTests({
        ...collectCommandTests(packageRoot),
        exemptions: COMMAND_TEST_EXEMPTIONS,
      })
    ).toEqual([]);
  });
});
