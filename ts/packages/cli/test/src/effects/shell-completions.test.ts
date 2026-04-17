import { Command, Options } from '@effect/cli';
import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { getCompletionScript } from 'src/effects/shell-completions';

describe('shell-completions', () => {
  it('sanitizes fish completion descriptions with quotes and newlines', async () => {
    const query = Options.text('query').pipe(
      Options.withDescription('User says "$HOME"\nCan run (date)')
    );

    const command = Command.make('demo', { query }, () => Effect.void).pipe(
      Command.withDescription("Demo command's help\nwith multiple lines")
    );

    const lines = await Effect.runPromise(getCompletionScript(command, 'fish'));
    const joined = lines.join('\n');

    expect(lines.every(line => !line.includes('\n'))).toBe(true);
    expect(joined).toContain(`-d "User says \\\"\\$HOME\\\" Can run \\(date\\)"`);
  });
});
