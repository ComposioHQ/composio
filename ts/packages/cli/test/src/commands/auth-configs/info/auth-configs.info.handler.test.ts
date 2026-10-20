import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { runAuthConfigsInfo } from 'src/commands/auth-configs/info/auth-configs.info.handler';
import { MockConsole } from 'test/__utils__';
import { AuthConfigsHandlerTest } from 'test/__utils__/layers/auth-configs';
import { makeAuthConfigItem } from 'test/__utils__/models/auth-configs';

const gmail = makeAuthConfigItem();

describe('runAuthConfigsInfo', () => {
  it.effect('[Given] a known ID [Then] prints the auth config JSON to stdout', () => {
    const { layer, outputs, exitCode } = AuthConfigsHandlerTest({
      authConfigsData: { items: [gmail] },
    });
    return Effect.gen(function* () {
      yield* runAuthConfigsInfo({ id: Option.some('ac_gmail_default') });

      expect(outputs).toEqual([JSON.stringify(gmail, null, 2)]);
      const decoration = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
      expect(decoration).toContain('[Auth Config: Gmail Default]');
      expect(decoration).toContain('Tool Router: Enabled');
      expect(exitCode()).toBeUndefined();
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] no ID [Then] warns, sends no request, and exits 0', () => {
    // The stub repository dies on any call, so reaching the API fails the test.
    const { layer, outputs, exitCode } = AuthConfigsHandlerTest({
      repository: { getAuthConfig: () => Effect.die('getAuthConfig must not be called') },
    });
    return Effect.gen(function* () {
      yield* runAuthConfigsInfo({ id: Option.none() });

      expect(yield* MockConsole.getLines({ stream: 'stderr' })).toEqual([
        'Missing required argument: <id>',
      ]);
      expect(outputs).toEqual([]);
      expect(exitCode()).toBeUndefined();
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] an unknown ID [Then] reports the API error with the list hint and exits 1',
    () => {
      const { layer, outputs, exitCode } = AuthConfigsHandlerTest({
        authConfigsData: { items: [gmail] },
      });
      return Effect.gen(function* () {
        yield* runAuthConfigsInfo({ id: Option.some('ac_missing') });

        const stderr = (yield* MockConsole.getLines({ stream: 'stderr', stripAnsi: true })).join(
          '\n'
        );
        expect(stderr).toContain('Auth config "ac_missing" not found.');
        expect(stderr).toContain(
          'Browse available auth configs:\n> composio dev auth-configs list'
        );
        expect(outputs).toEqual([]);
        expect(exitCode()).toBe(1);
      }).pipe(Effect.provide(layer));
    }
  );
});
