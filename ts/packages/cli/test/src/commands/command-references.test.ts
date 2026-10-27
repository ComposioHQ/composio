/**
 * Every `composio …` command a user-facing string names (hints, help examples, error messages,
 * intros) is a real command registration on the tree it names: `composio dev orgs switch` would
 * fail, since `orgs` is a root command only.
 *
 * Collects the text of every string and template literal under `src/` with the TypeScript
 * compiler, finds each `composio <words>` in it, and walks the words down the command tree
 * (`test/__utils__/command-tree.ts`). The walk stops at the first word that is not a subcommand;
 * the reference is broken when it stopped at a group whose next word looks like a subcommand
 * name, or before any command at all, unless that text is prose listed in `NOT_COMMANDS`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from '@effect/vitest';
import type { Command } from 'effect/cli';
import ts from 'typescript';
import { registrationsOf } from 'test/__utils__/command-tree';

const srcDir = path.resolve(import.meta.dirname, '../../../src');

const sourceFiles = fs
  .readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  .filter(file => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
  .map(file => path.join(srcDir, file));

/** The text of every string literal and template literal piece in `file`. */
const literalsOf = (file: string): ReadonlyArray<string> => {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const texts: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      texts.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return texts;
};

const REFERENCE = /(?<![\w@/.-])composio((?: [a-z][a-z0-9-]*)+)/g;

const references = sourceFiles.flatMap(file =>
  literalsOf(file).flatMap(text =>
    [...text.matchAll(REFERENCE)].map(match => ({
      file: path.relative(srcDir, file).split(path.sep).join('/'),
      words: match[1]!.trim().split(' '),
    }))
  )
);

const root = registrationsOf()[0]!.command;

const childNamed = (command: Command.Command.Any, word: string) =>
  command.subcommands
    .flatMap(group => group.commands)
    .find(child => child.name === word || child.alias === word);

/** The command path `words` resolves to, and the first word past it, if any. */
const resolve = (words: ReadonlyArray<string>) => {
  const walk = (
    command: Command.Command.Any,
    names: ReadonlyArray<string>,
    rest: ReadonlyArray<string>
  ): {
    readonly command: Command.Command.Any;
    readonly names: ReadonlyArray<string>;
    readonly next: string | undefined;
  } => {
    const [word, ...tail] = rest;
    const child = word === undefined ? undefined : childNamed(command, word);
    return child === undefined
      ? { command, names, next: word }
      : walk(child, [...names, child.name], tail);
  };
  return walk(root, [], words);
};

/** Prose that reads like a command reference, as `<file>: composio <words>`. */
const NOT_COMMANDS: ReadonlyArray<string> = [
  // The approval page's title: "The composio cli wants to execute TOOL".
  'services/tool-permissions.ts: composio cli wants to execute',
];

const unresolved = references.flatMap(({ file, words }) => {
  const { command, names, next } = resolve(words);
  const stoppedInGroup =
    next !== undefined && (names.length === 0 || command.subcommands.length > 0);
  return stoppedInGroup ? [`${file}: composio ${words.join(' ')}`] : [];
});

describe('command references in user-facing strings', () => {
  it('finds the references', () => {
    expect(references.length).toBeGreaterThan(100);
  });

  it('name real commands on the tree they name', () => {
    expect(unresolved.filter(reference => !NOT_COMMANDS.includes(reference))).toEqual([]);
  });

  it('lists no prose that is gone', () => {
    expect(NOT_COMMANDS.filter(reference => !unresolved.includes(reference))).toEqual([]);
  });
});
