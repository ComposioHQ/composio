import { GlobalFlag, type CliConfig } from 'effect/unstable/cli';

/**
 * Composio's `effect/unstable/cli` runner configuration.
 *
 * v4's `CliConfig.Service` shape shrank to a single field: `builtIns`, the
 * ordered list of built-in global flags (`--help`/`-h`, `--version`/`-v`,
 * `--wizard`, `--completions`, `--log-level`) that `Command.runWith` accepts
 * at every command in the tree. Composio only wants `--help`/`-h` and
 * `--version`/root `-v`, so `--wizard`, `--completions`, and `--log-level`
 * are dropped by omitting them here (this is the v4 equivalent of v3's
 * `showBuiltIns: false`, scoped down to exactly the two flags we still want).
 *
 * This is the *only* CliConfig customization Composio makes. Everything else
 * — "Did you mean?" suggestions on `UnrecognizedOption`/`UnknownSubcommand`,
 * and the `<name> v<version>` render for `--version` — uses v4's own
 * `CliOutput.defaultFormatter()` deliberately: suggestions are useful UX, and
 * the flag's version banner intentionally differs from the bare-semver
 * `composio version` *command* (see `commands/version.cmd.ts`), which is
 * unaffected and still prints the raw `pkg.version` via `ui.output()` for
 * scripts to parse.
 *
 * v3's `autoCorrectLimit` and `isCaseSensitive` have no v4 counterpart:
 *   - "Did you mean?" suggestions are computed unconditionally by the parser
 *     (`internal/auto-suggest.ts`) and attached to `CliError.UnrecognizedOption`
 *     / `CliError.UnknownSubcommand`. There is no config knob to disable them,
 *     and Composio no longer wants to — they render as-is.
 *   - Flag and subcommand name matching in v4's parser is always exact-match
 *     (no case-folding is performed), so no config is needed to keep
 *     Composio's case-sensitive behavior.
 */
export const ComposioCliConfig = {
  builtIns: [GlobalFlag.Help, GlobalFlag.Version],
} satisfies Partial<CliConfig.CliConfig.Service>;
