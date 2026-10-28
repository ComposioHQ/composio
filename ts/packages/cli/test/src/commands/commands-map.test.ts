/**
 * Keeps `src/commands/COMMANDS.md` in step with the command tree: one row per command
 * registration, with the file that defines it. `pnpm --filter @composio/cli run commands:map`
 * rewrites the file; `pnpm test` fails while it is stale.
 *
 * A registration's source file is the `.cmd.ts` module that exports its definition, so no command
 * declares its own file. A definition is recognised by its name and its `examples` array:
 * `effect/cli` 4.0.5 creates that array in `Command.make` and `Command.withExamples` and every
 * other combinator (`withRegisteredSubcommands`, `withCommandMeta`, `Command.provide`, …) carries
 * it over unchanged, so two definitions with the same name and description (`signup` and
 * `agent signup`) stay apart. Should an upgrade copy it, every row fails to match below, loudly.
 * Commands assembled by a function rather than exported are listed in `ASSEMBLED`.
 */
import * as path from 'node:path';
import { describe, expect, it } from '@effect/vitest';
import { Command } from 'effect/cli';
import * as prettier from 'prettier';
import { buildRootCommand } from 'src/commands';
import { commandPathOf } from 'src/invocation/command-identity';
import { EVERY_FEATURE, type Registration, registrationsOf } from 'test/__utils__/command-tree';
import { collectCommandTests } from '../../../scripts/command-tests';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const repoRoot = path.resolve(packageRoot, '../../..');
const commandsDir = path.join(packageRoot, 'src', 'commands');

const repoPath = (file: string) => path.relative(repoRoot, file).split(path.sep).join('/');

/** Commands built by a function at assembly time, by command path, with the file that builds them. */
const ASSEMBLED: Readonly<Record<string, string>> = {
  dev: 'dev.cmd.ts',
  help: 'root-help.ts',
};

const definitions = await Promise.all(
  collectCommandTests(packageRoot).commands.map(async file => {
    const module: Record<string, unknown> = await import(path.join(commandsDir, file));
    return {
      file: repoPath(path.join(commandsDir, file)),
      commands: Object.values(module).filter(Command.isCommand),
    };
  })
);

const sameDefinition = (a: Command.Command.Any, b: Command.Command.Any) =>
  a.name === b.name && a.examples === b.examples;

/** The `.cmd.ts` file that exports `registration`'s definition, or why there is not one. */
const sourceOf = ({ identity, command }: Registration): string => {
  const assembled = ASSEMBLED[identity.path.join(' ')];
  if (assembled !== undefined) {
    return repoPath(path.join(commandsDir, assembled));
  }
  const files = [
    ...new Set(
      definitions
        .filter(({ commands }) => commands.some(candidate => sameDefinition(candidate, command)))
        .map(({ file }) => file)
    ),
  ];
  if (files.length !== 1) {
    throw new Error(
      `\`${commandPathOf(identity)}\` matches ${files.length === 0 ? 'no exported command' : files.join(', ')}; export its definition from one .cmd.ts file, or list it in ASSEMBLED.`
    );
  }
  return files[0]!;
};

const registrations = registrationsOf();
const withoutExperiments = new Set(
  registrationsOf(
    buildRootCommand({ ...EVERY_FEATURE, isExperimentalFeatureEnabled: () => false })
  ).map(({ identity }) => commandPathOf(identity))
);

const rows = registrations
  .map(registration => ({
    registration,
    path: commandPathOf(registration.identity),
    source: sourceOf(registration),
  }))
  .toSorted((a, b) =>
    a.path === 'composio'
      ? -1
      : b.path === 'composio'
        ? 1
        : a.path < b.path
          ? -1
          : a.path > b.path
            ? 1
            : 0
  );

/** Other registrations of the same definition: a root shortcut and its place in a group. */
const alsoAt = (row: (typeof rows)[number]) =>
  rows
    .filter(
      other => other !== row && sameDefinition(other.registration.command, row.registration.command)
    )
    .map(other => `\`${other.path}\``)
    .join(', ');

const visibility = ({ registration, path }: (typeof rows)[number]) =>
  registration.unlisted ? 'unlisted' : withoutExperiments.has(path) ? 'listed' : 'experimental';

const code = (text: string | undefined) => (text ? `\`${text}\`` : '');

const COMMANDS_MD = [
  '<!-- Generated from the command tree by `pnpm --filter @composio/cli run commands:map`. Do not edit; `pnpm test` fails while it is stale. -->',
  '',
  '# Commands',
  '',
  'Every command registration of the CLI and the file that defines it. To find a command, grep this file for its path.',
  '',
  '- **Tree**: `dev` for commands under `composio dev` (developer mode), `root` otherwise.',
  '- **Also at**: other registrations of the same definition, such as a root shortcut.',
  '- **Login**: the command needs a logged-in user (`requiresLogin`, inherited from its group).',
  '- **Visibility**: `unlisted` commands are left out of help but still run; `experimental` ones exist only while their experimental feature is enabled.',
  '- `composio help <command>` mirrors every row and is not listed.',
  '',
  '| Command | Tree | Source | Alias | Also at | Login | Visibility |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(row => {
    const { registration, path, source } = row;
    const cells = [
      code(path),
      registration.identity.path[0] === 'dev' ? 'dev' : 'root',
      code(source),
      code(registration.command.alias),
      alsoAt(row),
      registration.identity.meta.requiresLogin ? 'yes' : 'no',
      visibility(row),
    ];
    return `| ${cells.join(' | ')} |`;
  }),
  '',
].join('\n');

describe('src/commands/COMMANDS.md', () => {
  it('is current (regenerate with `pnpm --filter @composio/cli run commands:map`)', async () => {
    const file = path.join(commandsDir, 'COMMANDS.md');
    // Formatted as the commit hook formats Markdown, so a commit leaves the file current.
    const formatted = await prettier.format(COMMANDS_MD, {
      ...(await prettier.resolveConfig(file)),
      filepath: file,
    });
    await expect(formatted).toMatchFileSnapshot(file);
  });
});
