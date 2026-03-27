import { describe, expect, layer } from '@effect/vitest';
import { Cause, ConfigProvider, Effect, Exit } from 'effect';
import { formatInvalidLimitMessage } from 'src/ui/clamp-limit';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive } from 'test/__utils__';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const invalidLimitMessage = formatInvalidLimitMessage(51);

const limitValidationCases = [
  {
    commandName: 'composio search',
    args: ['search', 'send', '--limit', '51'],
  },
  {
    commandName: 'composio tools list',
    args: ['tools', 'list', 'gmail', '--limit', '51'],
  },
  {
    commandName: 'composio dev auth-configs list',
    args: ['dev', 'auth-configs', 'list', '--limit', '51'],
  },
  {
    commandName: 'composio dev connected-accounts list',
    args: ['dev', 'connected-accounts', 'list', '--limit', '51'],
  },
  {
    commandName: 'composio dev triggers list',
    args: ['dev', 'triggers', 'list', '--limit', '51'],
  },
  {
    commandName: 'composio dev triggers status',
    args: ['dev', 'triggers', 'status', '--limit', '51'],
  },
  {
    commandName: 'composio dev orgs list',
    args: ['dev', 'orgs', 'list', '--limit', '51'],
  },
  {
    commandName: 'composio dev orgs switch',
    args: ['dev', 'orgs', 'switch', '--limit', '51'],
  },
  {
    commandName: 'composio dev projects list',
    args: ['dev', 'projects', 'list', '--org-id', 'org_test', '--limit', '51'],
  },
  {
    commandName: 'composio dev logs tools',
    args: ['dev', 'logs', 'tools', '--limit', '51'],
  },
  {
    commandName: 'composio dev logs triggers',
    args: ['dev', 'logs', 'triggers', '--limit', '51'],
  },
] as const;

describe('CLI: shared --limit validation', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider }))(it => {
    for (const testCase of limitValidationCases) {
      it.scoped(`${testCase.commandName} rejects limits above 50`, () =>
        Effect.gen(function* () {
          const exit = yield* cli(testCase.args).pipe(Effect.exit);

          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isSuccess(exit)) {
            return;
          }

          const squashed = Cause.squash(exit.cause);
          const message = squashed instanceof Error ? squashed.message : String(squashed);

          expect(message).toContain(invalidLimitMessage);
        })
      );
    }
  });
});
