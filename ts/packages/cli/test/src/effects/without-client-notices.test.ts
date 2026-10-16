import { describe, expect, it } from '@effect/vitest';
import { Effect, Logger } from 'effect';
import { withoutClientNotices } from 'src/effects/without-client-notices';

describe('withoutClientNotices', () => {
  it.effect('keeps a record that only reads like a client notice', () => {
    const seen: Array<unknown> = [];
    const recording = Logger.make(({ message }) => {
      seen.push(message);
    });
    return Effect.gen(function* () {
      yield* Effect.logWarning('Composio: the CLI warns about something');

      expect(seen).toStrictEqual([['Composio: the CLI warns about something']]);
    }).pipe(Effect.provide(Logger.layer([withoutClientNotices(recording)])));
  });
});
