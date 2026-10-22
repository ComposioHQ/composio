import { VERSION as clientLibraryVersion, type ClientIdentity } from '@composio/client/effect';
import { APP_VERSION } from 'src/constants';

const runtime = () =>
  typeof Bun !== 'undefined'
    ? { name: 'BUN', version: Bun.version }
    : { name: 'NODEJS', version: process.versions.node };

/**
 * The CLI as the API client reports it. The client sends the product headers
 * from it, adds its own library headers, and detects the runtime version.
 */
export const cliClientIdentity = (): ClientIdentity => ({
  product: '@composio/cli',
  version: APP_VERSION,
  source: 'CLI',
  framework: 'cli',
  runtime: runtime().name,
});

/**
 * Product attribution for first-party HTTP requests that do not go through an
 * API client (analytics dispatch, the agents service, the companion runtime).
 * API clients get the same attribution from {@link cliClientIdentity}.
 */
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
