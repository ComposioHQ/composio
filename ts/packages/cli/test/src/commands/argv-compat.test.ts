import { describe, expect, it } from 'vitest';
import { normalizeRunScriptArgs } from 'src/commands/argv-compat';

const argv = (...args: ReadonlyArray<string>) => ['bun', 'composio', ...args];

describe('normalizeRunScriptArgs', () => {
  it.each(['--unknown', '--foo_bar', '--foo_bar=value', '-foo_bar'])(
    'leaves %s ahead of inline source for the framework to reject',
    flag => {
      const input = argv('run', flag, 'console.log(1)');

      expect(normalizeRunScriptArgs(input)).toEqual(input);
    }
  );

  it('still treats inline source that starts with a dash and a digit as the script', () => {
    expect(normalizeRunScriptArgs(argv('run', '-1 + 2'))).toEqual(argv('run', '--', '-1 + 2'));
  });

  it('forwards an unknown flag after --file as a script argument', () => {
    expect(normalizeRunScriptArgs(argv('run', '--file', 'script.ts', '--repo', 'acme'))).toEqual(
      argv('run', '--file', 'script.ts', '--', '--repo', 'acme')
    );
  });

  it('keeps flag-shaped inline source behind an explicit delimiter', () => {
    const input = argv('run', '--', '--unknown');

    expect(normalizeRunScriptArgs(input)).toEqual(input);
  });
});
