import { Command, Flag } from 'effect/cli';
import { SHELLS } from 'src/services/shell-config';
import { runInstall } from './install.handler';

const completionsOpt = Flag.Boolean('completions').pipe(
  Flag.withDescription('Install shell completions.'),
  Flag.withDefault(false)
);

const noCompletionsOpt = Flag.Boolean('no-completions').pipe(
  Flag.withDescription('Deprecated: shell completions are skipped by default.'),
  Flag.withDefault(false)
);

const shellOpt = Flag.Literals('shell', SHELLS).pipe(
  Flag.withDescription('Override automatic shell detection.'),
  Flag.optional
);

/**
 * CLI command to set up shell integration (PATH and completions).
 *
 * The directory added to `PATH` is `COMPOSIO_BIN_DIR` when set — the documented
 * override an installer hands to this command — then `~/.local/bin` when its
 * `composio` entry point is this executable, then the running binary's own
 * directory.
 *
 * @example
 * ```bash
 * composio install
 * composio install --completions
 * composio install --no-completions
 * composio install --shell zsh
 * COMPOSIO_BIN_DIR=~/.local/bin composio install
 * ```
 */
export const installCmd = Command.make(
  'install',
  { completions: completionsOpt, noCompletions: noCompletionsOpt, shell: shellOpt },
  runInstall
).pipe(
  Command.withDescription(
    'Set up shell integration (PATH and completions). Set COMPOSIO_BIN_DIR to choose the directory added to PATH; it otherwise defaults to ~/.local/bin when that holds this executable, and to the directory of the running binary.'
  )
);
