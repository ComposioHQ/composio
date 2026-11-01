import { NotFoundError } from '@composio/client/effect';

/**
 * A 404 as the Effect client reports one, with the API error envelope when the
 * scenario has one.
 */
export const notFoundError = (
  message: string,
  envelope?: { readonly message: string; readonly suggested_fix: string }
) =>
  new NotFoundError({
    message,
    method: 'GET',
    url: 'https://mock.invalid',
    status: 404,
    requestId: undefined,
    details: envelope ? { ...envelope, code: 404, slug: 'Not_Found', status: 404 } : undefined,
    body: envelope ? { error: envelope } : undefined,
  });
