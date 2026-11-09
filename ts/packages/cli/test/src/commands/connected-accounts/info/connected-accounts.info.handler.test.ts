import { describe, expect, it } from '@effect/vitest';
import { Console, Effect, Layer, Option } from 'effect';
import { runConnectedAccountsInfo } from 'src/commands/connected-accounts/info/connected-accounts.info.handler';
import { MISSING_ID_MESSAGE, missingIdHint } from 'src/commands/connected-accounts/format';
import { isUsageFailure } from 'src/commands/errors';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import { TerminalUI } from 'src/services/terminal-ui';
import { redact } from 'src/ui/redact';
import { ConnectedAccountsTest, MockConsole } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const EXPIRED_ACCOUNT: ConnectedAccountItem = {
  id: 'con_github_expired',
  alias: 'work',
  word_id: 'castle',
  status: 'EXPIRED',
  status_reason: 'Token expired',
  is_disabled: false,
  user_id: 'default',
  toolkit: { slug: 'github' },
  auth_config: {
    id: 'ac_github_oauth',
    auth_scheme: 'OAUTH2',
    is_composio_managed: false,
    is_disabled: false,
  },
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-10T00:00:00Z',
  test_request_endpoint: 'https://api.github.com/user',
};

/**
 * What `runConnectedAccountsInfo` reads: the connected-account repository and a headless
 * terminal whose stdout data lands in `outputs`.
 */
const infoTest = (items: ReadonlyArray<ConnectedAccountItem> = [EXPIRED_ACCOUNT]) => {
  const outputs: Array<string> = [];
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
    ConnectedAccountsTest({ connectedAccountsData: { items: [...items] } })
  );
  return { layer, outputs };
};

const stdoutLines = MockConsole.getLines({ stream: 'stdout', stripAnsi: true });
const stderrLines = MockConsole.getLines({ stream: 'stderr', stripAnsi: true });

describe('runConnectedAccountsInfo', () => {
  it.effect('[Given] an existing id [Then] prints the whole account as JSON on stdout', () => {
    const { layer, outputs } = infoTest();
    return Effect.gen(function* () {
      yield* runConnectedAccountsInfo({ id: Option.some('con_github_expired') });

      expect(outputs.map(output => JSON.parse(output))).toEqual([EXPIRED_ACCOUNT]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] an account with a status reason and test endpoint [Then] the note shows both',
    () => {
      const { layer } = infoTest();
      return Effect.gen(function* () {
        yield* runConnectedAccountsInfo({ id: Option.some('con_github_expired') });
        const note = (yield* stdoutLines).find(line =>
          line.startsWith('[Connected Account: github]')
        );

        expect(note).toBeDefined();
        expect(note).toContain('Alias: work');
        expect(note).toContain('Word Id: castle');
        expect(note).toContain('Status Reason: Token expired');
        // CI redacts ids (`CI=true`), so expect the id the way the formatter prints it.
        expect(note).toContain(
          `Auth Config: ${redact({ value: 'ac_github_oauth', prefix: 'ac_' })} (OAUTH2)`
        );
        expect(note).toContain('Composio Managed: No');
        expect(note).toContain('Test Endpoint: https://api.github.com/user');
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] no id [Then] fails with a usage error before any request', () => {
    const { layer, outputs } = infoTest();
    return Effect.gen(function* () {
      const failure = yield* runConnectedAccountsInfo({ id: Option.none() }).pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: 'commands/CommandInputError',
        command: 'dev connected-accounts info',
        option: '<id>',
        message: `${MISSING_ID_MESSAGE}\n${missingIdHint('info')}`,
      });
      // The invocation prints a usage failure on stderr and exits 1.
      expect(isUsageFailure(failure)).toBe(true);
      expect(yield* stderrLines).toEqual([]);
      expect(yield* stdoutLines).toEqual([]);
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] an unknown id [Then] reports it, prints no data, and exits 1', () => {
    const { layer, outputs } = infoTest();
    return Effect.gen(function* () {
      const exit = yield* Effect.exit(runConnectedAccountsInfo({ id: Option.some('con_missing') }));
      const stderr = (yield* stderrLines).join('\n');

      expect(stderr).toContain('Connected account "con_missing" not found.');
      expect(stderr).toContain('composio dev connected-accounts list');
      expect(outputs).toEqual([]);
      expect(exitCodeOf(exit)).toBe(1);
    }).pipe(Effect.provide(layer));
  });
});
