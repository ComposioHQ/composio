import { describe, expect, it } from '@effect/vitest';
import { CliError } from 'effect/unstable/cli';
import { ComposioCliOutputFormatter } from 'src/cli-config';

/**
 * Characterization tests for Composio's `CliOutput.Formatter`.
 *
 * These lock two contracts that only exist at render time and are invisible
 * to typechecking:
 * - parser "Did you mean?" suggestions are stripped (v3's `autoCorrectLimit: 0`
 *   contract, which v4 has no config knob for);
 * - `--version` output is the bare semver (scripts and the setup-plugins e2e
 *   fixture parse it; v4's default renders `<name> v<version>`).
 *
 * The suggestion tests also guard the vendored tag spelling this formatter
 * matches on (`UnknownSubcomand`, a v4 beta typo): if a future beta renames
 * the tag, the switch in `cli-config.ts` stops matching and these tests fail
 * instead of suggestions silently reappearing.
 */
describe('ComposioCliOutputFormatter', () => {
  it('[Given] an unrecognized option with suggestions [Then] the rendered error has no "Did you mean"', () => {
    const error = new CliError.UnrecognizedOption({
      option: '--generat',
      command: ['composio'],
      suggestions: ['--generate'],
    });

    const rendered = ComposioCliOutputFormatter.formatCliError(error);

    expect(rendered).not.toContain('Did you mean');
    expect(rendered).not.toContain('--generate');
    expect(rendered).toContain('--generat');
  });

  it('[Given] an unknown subcommand with suggestions [Then] the rendered error has no "Did you mean"', () => {
    const error = new CliError.UnknownSubcommand({
      subcommand: 'tols',
      parent: ['composio'],
      suggestions: ['tools'],
    });

    const rendered = ComposioCliOutputFormatter.formatCliError(error);

    expect(rendered).not.toContain('Did you mean');
    expect(rendered).not.toContain('tools');
    expect(rendered).toContain('tols');
  });

  it('[Given] grouped errors with suggestions [Then] formatErrors strips them too', () => {
    const rendered = ComposioCliOutputFormatter.formatErrors([
      new CliError.UnrecognizedOption({
        option: '--wat',
        command: ['composio'],
        suggestions: ['--watch'],
      }),
    ]);

    expect(rendered).not.toContain('Did you mean');
  });

  it('[Given] a name and version [Then] formatVersion returns the bare version', () => {
    expect(ComposioCliOutputFormatter.formatVersion('composio', '1.2.3')).toBe('1.2.3');
  });
});
