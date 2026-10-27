import { describe, expect, it } from '@effect/vitest';
import { Console, Effect, Layer, Option } from 'effect';
import { runConnectedAccountsWhoami } from 'src/commands/connected-accounts/whoami/connected-accounts.whoami.handler';
import { inactiveStatusMessage } from 'src/commands/connected-accounts/whoami/connected-accounts.whoami.format';
import { MISSING_ID_MESSAGE, missingIdHint } from 'src/commands/connected-accounts/format';
import { isUsageFailure } from 'src/commands/errors';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { NodeProcess } from 'src/services/node-process';
import { TerminalUI } from 'src/services/terminal-ui';
import { ConnectedAccountsTest, MockConsole } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const account = (overrides: Partial<ConnectedAccountItem> = {}): ConnectedAccountItem => ({
  id: 'con_gmail_active',
  alias: 'personal',
  word_id: 'harbor',
  status: 'ACTIVE',
  status_reason: null,
  is_disabled: false,
  user_id: 'default',
  toolkit: { slug: 'gmail' },
  auth_config: {
    id: 'ac_gmail_oauth',
    auth_scheme: 'OAUTH2',
    is_composio_managed: true,
    is_disabled: false,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
  test_request_endpoint: '',
  ...overrides,
});

const ACTIVE_ACCOUNT = account();
const EXPIRED_ACCOUNT = account({ id: 'con_gmail_expired', status: 'EXPIRED' });

/**
 * What `runConnectedAccountsWhoami` reads: the connected-account repository, a headless
 * terminal whose stdout data lands in `outputs`, and a process whose exit codes land in
 * `exitCodes`.
 */
const whoamiTest = () => {
  const outputs: Array<string> = [];
  const exitCodes: Array<number> = [];
  const layer = Layer.mergeAll(
    Layer.effect(Console.Console, MockConsole.make),
    Layer.succeed(
      TerminalUI,
      TerminalUI.of({
        ...terminalUITestImpl,
        output: data =>
          Effect.sync(() => {
            outputs.push(data);
          }),
      })
    ),
    ConnectedAccountsTest({ connectedAccountsData: { items: [ACTIVE_ACCOUNT, EXPIRED_ACCOUNT] } }),
    Layer.succeed(
      NodeProcess,
      NodeProcess.of({
        cwd: '/tmp',
        execPath: '/tmp/composio',
        platform: 'darwin',
        arch: 'arm64',
        setExitCode: code =>
          Effect.sync(() => {
            exitCodes.push(code);
          }),
      })
    )
  );
  return { layer, outputs, exitCodes };
};

const stdoutLines = MockConsole.getLines({ stream: 'stdout', stripAnsi: true });
const stderrLines = MockConsole.getLines({ stream: 'stderr', stripAnsi: true });

describe('runConnectedAccountsWhoami', () => {
  it.effect('[Given] an active account [Then] prints its profile fields as JSON on stdout', () => {
    const { layer, outputs, exitCodes } = whoamiTest();
    return Effect.gen(function* () {
      yield* runConnectedAccountsWhoami({ id: Option.some('con_gmail_active') });

      expect(outputs.map(output => JSON.parse(output))).toEqual([
        {
          id: 'con_gmail_active',
          alias: 'personal',
          word_id: 'harbor',
          toolkit: 'gmail',
          user_id: 'default',
          status: 'ACTIVE',
          auth_config_id: 'ac_gmail_oauth',
          auth_scheme: 'OAUTH2',
        },
      ]);
      expect(yield* stderrLines).toEqual([]);
      expect(exitCodes).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] an account that is not ACTIVE [Then] warns before the profile', () => {
    const { layer, outputs } = whoamiTest();
    return Effect.gen(function* () {
      yield* runConnectedAccountsWhoami({ id: Option.some('con_gmail_expired') });

      expect(yield* stderrLines).toEqual([inactiveStatusMessage('EXPIRED')]);
      expect((yield* stdoutLines).some(line => line.startsWith('[whoami: gmail]'))).toBe(true);
      expect(JSON.parse(outputs[0] ?? '{}')).toMatchObject({ status: 'EXPIRED' });
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] no id [Then] fails with a usage error before any request', () => {
    const { layer, outputs, exitCodes } = whoamiTest();
    return Effect.gen(function* () {
      const failure = yield* runConnectedAccountsWhoami({ id: Option.none() }).pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: 'commands/CommandInputError',
        command: 'dev connected-accounts whoami',
        option: '<id>',
        message: `${MISSING_ID_MESSAGE}\n${missingIdHint('whoami')}`,
      });
      // `cli-main.ts` prints a usage failure on stderr and exits 1.
      expect(isUsageFailure(failure)).toBe(true);
      expect(yield* stderrLines).toEqual([]);
      expect(yield* stdoutLines).toEqual([]);
      expect(outputs).toEqual([]);
      expect(exitCodes).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] an unknown id [Then] reports it, prints no data, and exits 1', () => {
    const { layer, outputs, exitCodes } = whoamiTest();
    return Effect.gen(function* () {
      yield* runConnectedAccountsWhoami({ id: Option.some('con_missing') });

      expect((yield* stderrLines).join('\n')).toContain(
        'Connected account "con_missing" not found.'
      );
      expect(outputs).toEqual([]);
      expect(exitCodes).toEqual([1]);
    }).pipe(Effect.provide(layer));
  });
});
