import { describe, expect, test } from 'bun:test';
import { checkLinkedExamples, cliSkillCommands, runCommands } from '../ts/scripts/check-cli-skills';

const linked = (code: string) => `\`\`\`ts no-check repo-file=example.ts\n${code}\n\`\`\``;

describe('repo-linked skill examples', () => {
  test('accepts a current excerpt with different indentation', () => {
    expect(
      checkLinkedExamples(linked('  current();'), () => 'function example() {\ncurrent();\n}')
    ).toBe(1);
  });
  test('rejects the old registration recipe even when its framework types still compile', () => {
    expect(() =>
      checkLinkedExamples(
        linked('Command.withSubcommands(children)'),
        () => 'withRegisteredSubcommands(children)'
      )
    ).toThrow('Example differs from example.ts');
  });
  test('fails when linked examples disappear', () => {
    expect(() => checkLinkedExamples('# No examples', () => '')).toThrow('Expected at least one');
  });
  test('rejects an empty example instead of certifying nothing', () => {
    expect(() => checkLinkedExamples(linked(''), () => 'source')).toThrow('Empty example');
  });
  test('rejects paths outside the repository', () => {
    expect(() =>
      checkLinkedExamples(linked('example').replace('example.ts', '../private.ts'), () => '')
    ).toThrow('Invalid example source path');
  });
});

describe('CLI skill certification commands', () => {
  const standaloneExamples = ['node', '.agents/skills/effect-v4/scripts/check-examples.mjs'];
  const lintEffect = ['pnpm', '--filter', '@composio/cli', 'run', 'lint:effect'];

  test('excerpts-only mode runs only the standalone Effect examples', () => {
    expect(cliSkillCommands({ excerptsOnly: true })).toEqual([standaloneExamples]);
  });
  test('full mode adds the CLI typecheck and contract tests after the standalone examples', () => {
    const [first, typecheck, vitest] = cliSkillCommands({ excerptsOnly: false });
    expect(first).toEqual(standaloneExamples);
    expect(typecheck).toEqual([
      'pnpm',
      'exec',
      'turbo',
      'run',
      'typecheck',
      '--filter=@composio/cli',
    ]);
    expect(vitest).toContain('test/skills/command-example.test.ts');
  });
  test('neither mode repeats the Effect diagnostics owned by ts.typecheck.yml', () => {
    expect(cliSkillCommands({ excerptsOnly: true })).not.toContainEqual(lintEffect);
    expect(cliSkillCommands({ excerptsOnly: false })).not.toContainEqual(lintEffect);
  });
});

describe('runCommands', () => {
  const commands = [['first'], ['second'], ['third']];

  test('runs every command and succeeds when all exit 0', () => {
    const ran: string[] = [];
    expect(runCommands(commands, ([name]) => (ran.push(name!), 0))).toBe(0);
    expect(ran).toEqual(['first', 'second', 'third']);
  });
  test('stops at the first failure and returns its exit code', () => {
    const ran: string[] = [];
    const exitCodes: Record<string, number> = { first: 0, second: 3, third: 0 };
    expect(runCommands(commands, ([name]) => (ran.push(name!), exitCodes[name!]!))).toBe(3);
    expect(ran).toEqual(['first', 'second']);
  });
  test('treats a signal-terminated command (null exit code) as a failure', () => {
    expect(runCommands(commands, () => null)).toBe(1);
  });
});
