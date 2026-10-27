import {
  APIConnectionError as ClientAPIConnectionError,
  APIConnectionTimeoutError as ClientAPIConnectionTimeoutError,
  BadRequestError as ClientBadRequestError,
  ConfigurationError as ClientConfigurationError,
  DecodeError as ClientDecodeError,
  type ComposioError,
} from '@composio/client/effect';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { ReportedFailure } from 'src/effects/report-failure';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { TerminalUI } from 'src/services/terminal-ui';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const envelope = {
  error: {
    message: 'Auth config "ac_missing" was not found',
    code: 1803,
    slug: 'AuthConfig_NotFound',
    status: 400,
    request_id: 'req_body',
    suggested_fix: 'Check the auth config id',
  },
};

const url = 'https://backend.composio.dev/api/v3.1/auth_configs/{nanoid}';

const clientStatusError = new ClientBadRequestError({
  message: `400 ${JSON.stringify(envelope)}`,
  method: 'GET',
  url,
  status: 400,
  requestId: 'req_header',
  details: envelope.error,
  body: envelope,
});

const clientDecodeError = new ClientDecodeError({
  message: "The response body does not match the schema of 'authConfigs.retrieve'.",
  method: 'GET',
  url,
  status: 200,
  requestId: 'req_decode',
  operation: 'authConfigs.retrieve',
  issues: [{ path: ['toolkit', 'slug'], kind: 'InvalidType' }],
});

const options = {
  fallbackMessage: 'Failed to fetch auth config "ac_missing".',
  hint: 'Browse available auth configs:\n> composio dev auth-configs list',
  fallbackValue: 'fallback' as const,
};

// A TerminalUI whose stderr is not a TTY, recording every line the handler
// writes together with the channel it went to.
const recordingUI = () => {
  const lines: Array<string> = [];
  const record = (channel: string) => (message: string) =>
    Effect.sync(() => {
      lines.push(`${channel}: ${message}`);
    });
  const ui = TerminalUI.of({
    ...terminalUITestImpl,
    error: record('stderr'),
    log: { ...terminalUITestImpl.log, error: record('log.error'), step: record('log.step') },
  });
  return { ui, lines };
};

describe('handleClientApiError', () => {
  it.effect('prints the envelope message and the suggested fix, and fails the process', () =>
    Effect.gen(function* () {
      const { ui, lines } = recordingUI();

      const exit = yield* Effect.exit(handleClientApiError(ui, options)(clientStatusError));

      expect(lines).toStrictEqual([
        'stderr: Auth config "ac_missing" was not found',
        'stderr: Check the auth config id\n\nBrowse available auth configs:\n> composio dev auth-configs list',
      ]);
      expect(exitCodeOf(exit)).toBe(1);
    })
  );

  it.effect.each([
    new ClientAPIConnectionError({
      message: 'Connection error.',
      method: 'GET',
      url,
      reason: 'TransportError',
      description: 'fetch failed',
    }),
    new ClientAPIConnectionTimeoutError({ message: 'Request timed out.', method: 'GET', url }),
  ])('prints the fallback message for $_tag', error =>
    Effect.gen(function* () {
      const { ui, lines } = recordingUI();

      const exit = yield* Effect.exit(handleClientApiError(ui, options)(error));

      expect(lines).toStrictEqual([
        'stderr: Failed to fetch auth config "ac_missing".',
        'stderr: Browse available auth configs:\n> composio dev auth-configs list',
      ]);
      expect(exitCodeOf(exit)).toBe(1);
    })
  );

  it.effect('names the operation and request id of a decode failure and suggests an upgrade', () =>
    Effect.gen(function* () {
      const { ui, lines } = recordingUI();

      const exit = yield* Effect.exit(
        handleClientApiError(ui, {
          ...options,
          searchForSuggestions: () =>
            Effect.succeed([{ label: 'ac_similar', command: '> composio dev auth-configs info' }]),
        })(clientDecodeError)
      );

      expect(lines).toStrictEqual([
        "stderr: The API response for 'authConfigs.retrieve' is not in the shape this version of the CLI expects (request id: req_decode).",
        'stderr: Upgrade the CLI, then retry:\n> composio upgrade',
      ]);
      expect(exitCodeOf(exit)).toBe(1);
    })
  );

  it.effect('replaces the hint with suggestions when the search finds some', () =>
    Effect.gen(function* () {
      const { ui, lines } = recordingUI();

      yield* handleClientApiError(ui, {
        ...options,
        searchForSuggestions: () =>
          Effect.succeed([
            { label: 'ac_similar', command: '> composio dev auth-configs info "ac_similar"' },
          ]),
      })(clientStatusError).pipe(Effect.flip);

      expect(lines.at(-1)).toBe(
        'stderr: Check the auth config id\n\nDid you mean?\n  ac_similar\n\n> composio dev auth-configs info "ac_similar"'
      );
    })
  );
});

describe('Effect.catchTag(CLIENT_API_ERROR_TAGS, handleClientApiError(...))', () => {
  it.effect.each([
    clientStatusError,
    clientDecodeError,
    new ClientAPIConnectionError({
      message: 'Connection error.',
      method: 'GET',
      url,
      reason: 'TransportError',
      description: 'fetch failed',
    }),
    new ClientAPIConnectionTimeoutError({ message: 'Request timed out.', method: 'GET', url }),
  ])('reports $_tag and fails already reported', error =>
    Effect.gen(function* () {
      const { ui, lines } = recordingUI();

      // The tag list catches the client's whole error union.
      const exit = yield* Effect.exit(
        Effect.fail<ComposioError>(error).pipe(
          Effect.catchTag(CLIENT_API_ERROR_TAGS, handleClientApiError(ui, options))
        )
      );
      const failure = yield* Effect.flip(exit);

      expect(failure).toBeInstanceOf(ReportedFailure);
      expect(lines).not.toStrictEqual([]);
      expect(exitCodeOf(exit)).toBe(1);
    })
  );

  it.effect('leaves other failures alone', () =>
    Effect.gen(function* () {
      const { ui, lines } = recordingUI();
      const error = new ClientConfigurationError({ message: 'No credential.' });

      const failure = yield* Effect.fail<ComposioError>(error).pipe(
        Effect.catchTag(CLIENT_API_ERROR_TAGS, handleClientApiError(ui, options)),
        Effect.flip
      );

      expect(failure).toBe(error);
      expect(lines).toStrictEqual([]);
    })
  );
});
