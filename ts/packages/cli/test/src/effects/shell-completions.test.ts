import { describe, expect, it } from 'vitest';
import { _test } from 'src/effects/shell-completions';

describe('shell-completions', () => {
  it('removes fish descriptions from completion commands', () => {
    const line =
      'complete -c composio -n "__fish_seen_subcommand_from orgs; and __fish_seen_subcommand_from switch" -l limit -r -f -d \'Max orgs to fetch from API (default: 50)\'';

    expect(_test.sanitizeFishCompletionLine(line)).toBe(
      'complete -c composio -n "__fish_seen_subcommand_from orgs; and __fish_seen_subcommand_from switch" -l limit -r -f'
    );
  });

  it('preserves non-complete fish lines unchanged', () => {
    const line = 'function __fish_composio_no_subcommand';

    expect(_test.sanitizeFishCompletionLine(line)).toBe(line);
  });

  it('drops multiline descriptions before they can break fish parsing', () => {
    const line = `complete -c composio -n "__fish_seen_subcommand_from dev" -l alias -r -f -d 'Line one
line two with "quotes" and apostrophe'"'"'s'`;

    expect(_test.sanitizeFishCompletionLine(line)).toBe(
      'complete -c composio -n "__fish_seen_subcommand_from dev" -l alias -r -f'
    );
  });
});
