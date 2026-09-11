import { describe, expect, it } from '@effect/vitest';
import { afterEach, vi } from 'vitest';
import { Effect } from 'effect';
import { getSessionInfoByUserApiKey, HttpServerError } from 'src/services/composio-clients';
import { isUserApiKeyRejection } from 'src/utils/api-error-extraction';
import { userApiKeyRejectionResponse } from 'test/__utils__/models/user-api-key-rejection';

const emptyOkResponse = () =>
  new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('getSessionInfoByUserApiKey org context', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The response body does not satisfy SessionInfoResponse, so decoding fails —
  // but the fetch call (whose headers we assert) has already happened by then.
  const callIgnoringDecode = (params: { baseURL: string; userApiKey: string; orgId?: string }) =>
    getSessionInfoByUserApiKey(params).pipe(Effect.ignore);

  it.effect(
    '[Given] orgId [Then] forwards it as x-org-id so the backend honors the switched org',
    () =>
      Effect.gen(function* () {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(emptyOkResponse());

        yield* callIgnoringDecode({
          baseURL: 'https://backend.composio.dev',
          userApiKey: 'uak_test',
          orgId: 'ok_selected_org',
        });

        const [url, init] = fetchSpy.mock.calls[0]!;
        expect(String(url)).toContain('/api/v3/auth/session/info');
        const headers = new Headers((init as RequestInit).headers);
        expect(headers.get('x-user-api-key')).toBe('uak_test');
        expect(headers.get('x-org-id')).toBe('ok_selected_org');
      })
  );

  it.effect('[Given] no orgId [Then] omits x-org-id (login-time behavior is unchanged)', () =>
    Effect.gen(function* () {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(emptyOkResponse());

      yield* callIgnoringDecode({
        baseURL: 'https://backend.composio.dev',
        userApiKey: 'uak_test',
      });

      const [, init] = fetchSpy.mock.calls[0]!;
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('x-user-api-key')).toBe('uak_test');
      expect(headers.has('x-org-id')).toBe(false);
    })
  );
});

describe('plain-fetch helpers on a rejected user API key', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect('[Given] the backend rejection body [Then] the error keeps its slug and code', () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(userApiKeyRejectionResponse());

      const error = yield* getSessionInfoByUserApiKey({
        baseURL: 'https://backend.composio.dev',
        userApiKey: 'uak_revoked',
      }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(HttpServerError);
      expect(error).toMatchObject({
        status: 401,
        apiError: { slug: 'UserApiKey_Unauthorized', code: 2113 },
      });
      expect(isUserApiKeyRejection(error)).toBe(true);
    })
  );
});
