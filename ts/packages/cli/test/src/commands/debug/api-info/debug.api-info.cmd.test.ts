import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import {
  ABORTED_MESSAGE,
  NO_API_KEY_MESSAGE,
} from 'src/commands/debug/api-info/debug.api-info.format';
import { TerminalUI } from 'src/services/terminal-ui';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

// The fixture stores `uak_test_key` with current org `org_1`.
const LOGGED_IN_FIXTURE = 'user-config-with-global-context';

/** A headless terminal that answers yes to every confirmation. */
const confirmingUI = TerminalUI.of({
  ...terminalUITestImpl,
  confirm: () => Effect.succeed(true),
});

describe('CLI: composio debug api-info', () => {
  layer(TestLive({ fixture: LOGGED_IN_FIXTURE }))('[Given] the confirmation is declined', it => {
    it.effect('[Then] fails with a usage error and prints nothing on stdout', () =>
      Effect.gen(function* () {
        const error = yield* cli(['debug', 'api-info']).pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: 'commands/CommandInputError',
          command: 'debug',
          message: ABORTED_MESSAGE,
        });
        expect(yield* MockConsole.getLines({ stream: 'stdout' })).toEqual([]);
      })
    );
  });

  layer(TestLive({ terminalUI: confirmingUI }))('[Given] no stored login', it => {
    it.effect('[Then] fails with a usage error naming the missing key', () =>
      Effect.gen(function* () {
        const error = yield* cli(['debug', 'api-info']).pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: 'commands/CommandInputError',
          command: 'debug',
          message: NO_API_KEY_MESSAGE,
        });
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-with-empty-api-key', terminalUI: confirmingUI }))(
    '[Given] a stored login whose key is empty',
    it => {
      it.effect('[Then] fails naming the missing key and prints nothing on stdout', () =>
        Effect.gen(function* () {
          const error = yield* cli(['debug', 'api-info']).pipe(Effect.flip);

          expect(error).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'debug',
            message: NO_API_KEY_MESSAGE,
          });
          expect(yield* MockConsole.getLines({ stream: 'stdout' })).toEqual([]);
        })
      );
    }
  );

  layer(TestLive({ fixture: LOGGED_IN_FIXTURE, terminalUI: confirmingUI }))(
    '[Given] a stored login and a confirmation',
    it => {
      it.effect('[Then] prints the key, org, and consumer user id as indented JSON', () =>
        Effect.gen(function* () {
          yield* cli(['debug', 'api-info']);

          const stdout = yield* MockConsole.getLines({ stream: 'stdout' });
          expect(stdout).toHaveLength(1);
          expect(JSON.parse(stdout[0] ?? '')).toEqual({
            apiKey: 'uak_test_key',
            orgId: 'org_1',
            consumerUserId: 'consumer-user-org_1',
          });
          expect(stdout[0]).toContain('\n  "apiKey"');
        })
      );
    }
  );
});
