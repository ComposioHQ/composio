/**
 * The commands the skill teaches, checked against the binary.
 *
 * Every `composio …` line in a code block of the built skill is reduced to its
 * command path and looked up with `composio help <path>`. A path the binary
 * does not know is a line that sends an agent into a parse error on its first
 * try.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { startCliRig, type CliRig } from '@e2e-tests/cli-fake-backend/rig';
import { buildSkill } from './src/skill';

const RIG_TIMEOUT_MS = 1_200_000;

/** `composio dev toolkits info github` -> `dev toolkits info github`: the words before any flag, quote, or slug. */
const leadingWords = (line: string): string[] => {
  const words: string[] = [];
  for (const token of line.trim().split(/\s+/).slice(1)) {
    if (!/^[a-z][a-z-]*$/.test(token)) break;
    words.push(token);
  }
  return words;
};

const taughtCommands = (): Array<{ file: string; line: string; words: string[] }> => {
  const skill = buildSkill();
  const documents = { 'SKILL.md': skill.skillMarkdown, ...skill.references };
  return Object.entries(documents).flatMap(([file, markdown]) =>
    [...markdown.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap(block =>
      (block[1] ?? '')
        .split('\n')
        .filter(line => line.startsWith('composio '))
        .map(line => ({ file, line, words: leadingWords(line) }))
    )
  );
};

describe('skill: every command it teaches exists', () => {
  let rig: CliRig;
  const unknown: Array<{ file: string; line: string; error: string }> = [];
  const commands = taughtCommands();

  beforeAll(async () => {
    rig = await startCliRig({ label: 'skill-commands' });
    const paths = new Map(commands.map(command => [command.words.join(' '), command]));
    for (const [, command] of paths) {
      // `composio help` rejects an argument and an unknown subcommand differently.
      // Trailing words that are arguments (`link gmail`) are dropped one at a
      // time; a word that is not a subcommand stops the search. `<path> --help`
      // cannot be used: it prints the parent's help and exits 0 for both.
      for (let length = command.words.length; length > 0; length -= 1) {
        const result = await rig.run(`composio help ${command.words.slice(0, length).join(' ')}`);
        if (result.exitCode === 0) break;
        if (!result.stderr.includes('Unexpected positional argument')) {
          const error = /Unknown subcommand[^\n]*/.exec(result.stderr)?.[0] ?? result.stderr.trim();
          unknown.push({ file: command.file, line: command.line, error });
          break;
        }
      }
    }
  }, RIG_TIMEOUT_MS);

  afterAll(async () => {
    await rig.stop();
  });

  it('finds command lines in the skill and its references', () => {
    expect(commands.length).toBeGreaterThan(20);
    expect(new Set(commands.map(command => command.file))).toEqual(
      new Set(['SKILL.md', 'composio-dev.md', 'power-user-examples.md', 'troubleshooting.md'])
    );
  });

  it('SKILL.md teaches only commands the binary has', () => {
    expect(unknown.filter(command => command.file === 'SKILL.md')).toEqual([]);
  });

  it('the references teach only commands the binary has', () => {
    expect(
      unknown
        .filter(command => command.file !== 'SKILL.md')
        .map(command => `${command.file}: ${command.line}`)
    ).toEqual([]);
  });
});
