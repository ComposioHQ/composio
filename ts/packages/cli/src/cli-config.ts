import { GlobalFlag, type CliConfig } from 'effect/unstable/cli';

/**
 * Composio's `effect/unstable/cli` runner configuration.
 *
 * v4's `CliConfig.Service` shape shrank to a single field: `builtIns`, the
 * ordered list of built-in global flags (`--help`/`-h`, `--version`/`-v`,
 * `--wizard`, `--completions`, `--log-level`) that `Command.runWith` accepts
 * at every command in the tree. Composio only wants `--help`/`-h`, so every
 * other built-in is dropped by omitting it here (this is the v4 equivalent of
 * v3's `showBuiltIns: false`, scoped down to exactly the flag we still want).
 *
 * `GlobalFlag.Version` is deliberately absent: `composio --version` and
 * `composio -v` must print byte-identical output to the `composio version`
 * *command* (a bare semver via `ui.output()`, see `commands/version.cmd.ts`),
 * so `src/commands/index.ts` rewrites those spellings to the `version` command
 * before parsing (`normalizeVersionFlag`). Leaving the built-in active would let
 * `composio <subcommand> --version` reach v4's `<name> v<version>` banner
 * instead — a second, different rendering of the same value.
 *
 * This is the *only* CliConfig customization Composio makes. Everything else
 * — "Did you mean?" suggestions on `UnrecognizedOption`/`UnknownSubcommand`
 * and help rendering — uses v4's own `CliOutput.defaultFormatter()`
 * deliberately: suggestions are useful UX.
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
  builtIns: [GlobalFlag.Help],
} satisfies Partial<CliConfig.CliConfig.Service>;
