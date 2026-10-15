import { describe, expect, it } from '@effect/vitest';
import { Effect, Logger } from 'effect';
import { withoutClientNotices } from 'src/effects/without-client-notices';

describe('withoutClientNotices', () => {
  it.effect('drops the client deprecation notices and keeps every other record', () => {
    const seen: Array<unknown> = [];
    const recording = Logger.make(({ message }) => {
      seen.push(message);
    });
    return Effect.gen(function* () {
      yield* Effect.logWarning('Composio: `client.tools.list` is deprecated.');
      yield* Effect.logWarning('the CLI warns about something else');

      expect(seen).toStrictEqual([['the CLI warns about something else']]);
    }).pipe(Effect.provide(Logger.layer([withoutClientNotices(recording)])));
  });
});
