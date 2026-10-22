import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CommandTestExemption {
  readonly command: string;
  readonly reason: string;
}

export interface CommandTestInputs {
  readonly commands: readonly string[];
  readonly tests: readonly string[];
  readonly exemptions: readonly CommandTestExemption[];
}

const COMMAND_SUFFIX = '.cmd.ts';
const TEST_SUFFIX = '.cmd.test.ts';

// Command paths are relative to src/commands/; tests are relative to
// test/src/commands/. Both use forward slashes.
export const COMMAND_TEST_EXEMPTIONS: readonly CommandTestExemption[] = [];

// A group entry is `<dir>.cmd.ts` or `root-<dir>.cmd.ts` inside `<dir>/` when
// `<dir>/` holds other command modules; it only wires subcommands and is
// covered by root-help-consistency.test.ts. The same name with nothing below
// it is a top-level command in the per-command directory shape
// (`login/login.cmd.ts`).
export const isGroupEntry = (command: string, commands: readonly string[]): boolean => {
  const segments = command.split('/');
  const dir = segments.at(-2);
  const base = segments.at(-1);
  if (dir === undefined || base === undefined) return false;
  if (base !== `${dir}${COMMAND_SUFFIX}` && base !== `root-${dir}${COMMAND_SUFFIX}`) return false;
  const prefix = `${segments.slice(0, -1).join('/')}/`;
  return commands.some(other => other !== command && other.startsWith(prefix));
};

export const mirroredTestPath = (command: string): string =>
  command
    .split('/')
    .filter(segment => segment !== 'commands')
    .join('/')
    .replace(/\.cmd\.ts$/, TEST_SUFFIX);

// Resolves a test to the command it exercises: the longest dotted prefix of
// its basename that names a `<prefix>.cmd.ts` anywhere under src/commands/.
// Extra segments name a test aspect (`setup.telemetry`, `tools.execute.client`).
export const resolveTestCommand = (
  test: string,
  commands: readonly string[]
): string | undefined => {
  const base = path.posix.basename(test, TEST_SUFFIX);
  const byBasename = new Map(commands.map(command => [path.posix.basename(command), command]));
  const parts = base.split('.');
  for (let length = parts.length; length > 0; length--) {
    const match = byBasename.get(`${parts.slice(0, length).join('.')}${COMMAND_SUFFIX}`);
    if (match !== undefined) return match;
  }
  return undefined;
};

export const checkCommandTests = ({
  commands,
  tests,
  exemptions,
}: CommandTestInputs): readonly string[] => {
  const errors: string[] = [];
  const testSet = new Set(tests);
  const commandSet = new Set(commands);
  const exempted = new Map(exemptions.map(exemption => [exemption.command, exemption]));

  for (const exemption of exemptions) {
    if (!commandSet.has(exemption.command)) {
      errors.push(
        `stale exemption: ${exemption.command} is not a command under src/commands/; remove it from COMMAND_TEST_EXEMPTIONS.`
      );
    } else if (isGroupEntry(exemption.command, commands)) {
      errors.push(
        `stale exemption: ${exemption.command} is a group entry and needs no test; remove it from COMMAND_TEST_EXEMPTIONS.`
      );
    }
  }

  for (const command of [...commands].sort()) {
    if (isGroupEntry(command, commands)) continue;
    const expected = mirroredTestPath(command);
    const hasTest = testSet.has(expected);
    if (exempted.has(command)) {
      if (hasTest) {
        errors.push(
          `stale exemption: ${command} now has test/src/commands/${expected}; remove it from COMMAND_TEST_EXEMPTIONS.`
        );
      }
    } else if (!hasTest) {
      errors.push(`missing test: src/commands/${command} needs test/src/commands/${expected}.`);
    }
  }

  for (const test of [...tests].sort()) {
    if (resolveTestCommand(test, commands) === undefined) {
      errors.push(
        `orphan test: test/src/commands/${test} matches no <prefix>.cmd.ts under src/commands/.`
      );
    }
  }

  return errors;
};

const listFiles = (root: string, suffix: string): string[] =>
  fs
    .readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter(file => file.endsWith(suffix) && fs.statSync(path.join(root, file)).isFile())
    .map(file => file.split(path.sep).join('/'))
    .sort();

export const collectCommandTests = (
  packageRoot: string
): { readonly commands: readonly string[]; readonly tests: readonly string[] } => ({
  commands: listFiles(path.join(packageRoot, 'src', 'commands'), COMMAND_SUFFIX),
  tests: listFiles(path.join(packageRoot, 'test', 'src', 'commands'), TEST_SUFFIX),
});
