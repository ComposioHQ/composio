/**
 * The body the Composio backend returns for a rejected user API key, captured
 * from `GET /api/v3/auth/session/info` on 2026-09-11.
 */
export const userApiKeyRejectionBody = {
  error: {
    message: 'Invalid or revoked user API key',
    code: 2113,
    slug: 'UserApiKey_Unauthorized',
    status: 401,
    request_id: '1c3ccc6f-42a4-4fab-a18a-0b370c4ad27d',
    suggested_fix: '',
  },
};

export const userApiKeyRejectionResponse = () =>
  new Response(JSON.stringify(userApiKeyRejectionBody), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
