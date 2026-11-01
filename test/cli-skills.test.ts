import { describe, expect, test } from 'bun:test';
import { checkLinkedExamples } from '../ts/scripts/check-cli-skills';

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
