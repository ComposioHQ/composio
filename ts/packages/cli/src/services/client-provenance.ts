import { VERSION as clientLibraryVersion } from '@composio/client';
import { APP_VERSION } from 'src/constants';

const runtime = () =>
  typeof Bun !== 'undefined'
    ? { name: 'BUN', version: Bun.version }
    : { name: 'NODEJS', version: process.versions.node };

/** Product attribution shared by API clients and first-party raw HTTP requests. */
export const cliRequestHeaders = (): Record<string, string> => ({
  'x-framework': 'cli',
  'x-source': 'CLI',
  'x-runtime': runtime().name,
  'x-client-runtime': runtime().name.toLowerCase(),
  'x-runtime-version': runtime().version,
  'x-sdk-version': APP_VERSION,
  'x-client-provenance': '@composio/cli',
  'x-client-version': APP_VERSION,
  'x-client-language': 'typescript',
});

export const cliAnalyticsProvenance = (version = APP_VERSION) => ({
  client_name: '@composio/cli',
  client_version: version,
  client_language: 'typescript',
  client_runtime: runtime().name.toLowerCase(),
  client_runtime_version: runtime().version,
  client_library: '@composio/client',
  client_library_version: clientLibraryVersion,
  client_framework: 'cli',
});
