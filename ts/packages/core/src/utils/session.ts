import { BaseComposioProvider } from '../provider/BaseProvider';
import { version } from '../../package.json';
import { ComposioConfig } from '../composio';
import { ComposioRequestHeaders } from '../types/composio.types';

export function getSessionHeaders(
  provider: BaseComposioProvider<unknown, unknown, unknown> | undefined
) {
  return {
    'x-source': provider?.name || '@composio/core',
    'x-runtime': 'composio-v3-ts-sdk',
    'x-sdk-version': version,
  };
}

export const getDefaultHeaders = (
  headers: ComposioRequestHeaders | undefined,
  provider: BaseComposioProvider<unknown, unknown, unknown> | undefined
) => {
  const sessionHeaders = getSessionHeaders(provider);
  return {
    ...(headers || {}),
    ...sessionHeaders,
  };
};
