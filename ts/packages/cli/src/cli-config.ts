import { CliError, CliOutput, GlobalFlag, type CliConfig } from 'effect/unstable/cli';

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
 * v3's `autoCorrectLimit` and `isCaseSensitive` have no v4 counterpart:
 *   - "Did you mean?" suggestions are computed unconditionally by the parser
 *     (`internal/auto-suggest.ts`) and attached to `CliError.UnrecognizedOption`
 *     / `CliError.UnknownSubcommand`. There is no config knob to disable them.
 *     Composio's no-suggestions behavior is instead preserved by overriding the
 *     `CliOutput.Formatter` service in `cli-main.ts`, which strips the
 *     "Did you mean?" section before rendering.
 *   - Flag and subcommand name matching in v4's parser is always exact-match
 *     (no case-folding is performed), so no config is needed to keep
 *     Composio's case-sensitive behavior.
 */
export const ComposioCliConfig = {
  builtIns: [GlobalFlag.Help, GlobalFlag.Version],
} satisfies Partial<CliConfig.CliConfig.Service>;

/**
 * Strips "Did you mean?" suggestions from CLI errors that carry them
 * (`UnrecognizedOption`, `UnknownSubcommand`) before formatting.
 *
 * The v4 parser always computes nearest-match suggestions internally
 * (`internal/auto-suggest.ts`) and bakes them into the error's `message`
 * getter; there is no parser-level switch to turn this off (see
 * `ComposioCliConfig` above). Rebuilding the error with `suggestions: []`
 * recomputes `message` without the suggestion text, which is the only
 * public seam available to suppress it.
 */
const withoutSuggestions = (error: CliError.CliError): CliError.CliError => {
  switch (error._tag) {
    case 'UnrecognizedOption':
      return error.suggestions.length === 0
        ? error
        : new CliError.UnrecognizedOption({ ...error, suggestions: [] });
    case 'UnknownSubcomand':
      return error.suggestions.length === 0
        ? error
        : new CliError.UnknownSubcommand({ ...error, suggestions: [] });
    default:
      return error;
  }
};

/**
 * Composio's `CliOutput.Formatter`: the default v4 formatter with
 * `withoutSuggestions` applied to every error passed through it.
 *
 * `Command.runWith` renders help and parse/validation errors internally
 * (see `cli-main.ts` module docs) using whichever `CliOutput.Formatter` is
 * in the effect context, so providing this as a layer is the only way to
 * change that rendering without re-implementing `Command.runWith` itself.
 */
export const ComposioCliOutputFormatter: CliOutput.Formatter = (() => {
  const base = CliOutput.defaultFormatter();
  return {
    ...base,
    formatCliError: error => base.formatCliError(withoutSuggestions(error)),
    formatError: error => base.formatError(withoutSuggestions(error)),
    formatErrors: errors => base.formatErrors(errors.map(withoutSuggestions)),
    // v4's default renders `<name> v<version>`; v3 printed the bare version,
    // and scripts (including the setup-plugins e2e fixture) parse that output.
    formatVersion: (_name, version) => version,
  };
})();
