import type { SessionProxyExecuteResponse } from '@composio/client/resources/tool-router/session';

export const formatProxyOutput = (
  result: Pick<
    Extract<SessionProxyExecuteResponse, { result_type: 'completed' }>,
    'status' | 'data' | 'headers' | 'binary_data'
  >
) => {
  if (result.binary_data) {
    return JSON.stringify(
      {
        status: result.status ?? null,
        headers: result.headers ?? {},
        binary_data: result.binary_data,
      },
      null,
      2
    );
  }

  if (typeof result.data === 'string') {
    return result.data;
  }

  if (result.data === undefined || result.data === null) {
    return '';
  }

  return JSON.stringify(result.data, null, 2);
};

export const formatProxyErrorOutput = (params: {
  readonly error: string;
  readonly toolkit: string;
  readonly endpoint: string;
  readonly slug?: string;
}) =>
  JSON.stringify(
    {
      successful: false,
      error: params.error,
      toolkit: params.toolkit,
      endpoint: params.endpoint,
      slug: params.slug ?? null,
    },
    null,
    2
  );

/** The stdout result of a call refused because the toolkit is not connected. */
export const formatProxyNotConnectedOutput = (params: {
  readonly error: string;
  readonly toolkit: string;
  readonly endpoint: string;
}) =>
  JSON.stringify(
    {
      successful: false,
      error: params.error,
      toolkit: params.toolkit,
      endpoint: params.endpoint,
    },
    null,
    2
  );
