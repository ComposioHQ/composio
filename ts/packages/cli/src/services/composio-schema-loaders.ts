import type { SchemaLoaders } from '@composio/client/effect';

/**
 * Response schemas for the API reads the CLI consumes through the client's own
 * types, each behind the `import()` that loads it.
 *
 * This is a subset of the `schemaLoaders` table `@composio/client/effect/schemas`
 * exports. That table names every schema module the client ships, so importing
 * it would put all of them in the binary. A typed call whose operation is not
 * listed here must pass `decode: false`; without it the client fails the call
 * before sending anything.
 */
export const composioSchemaLoaders = {
  'cli.realtime.credentials': async () =>
    (await import('@composio/client/effect/schemas/cli/realtime/credentials'))
      .RealtimeCredentialsResponse,
  'logs.tools.list': async () =>
    (await import('@composio/client/effect/schemas/logs/tools/list')).ToolListResponse,
  'logs.tools.retrieve': async () =>
    (await import('@composio/client/effect/schemas/logs/tools/retrieve')).ToolRetrieveResponse,
  'org.consumer.listConnectedToolkits': async () =>
    (await import('@composio/client/effect/schemas/org/consumer/list-connected-toolkits'))
      .ConsumerListConnectedToolkitsResponse,
  'org.list': async () =>
    (await import('@composio/client/effect/schemas/org/list')).OrgListResponse,
  'org.project.list': async () =>
    (await import('@composio/client/effect/schemas/org/project/list')).ProjectListResponse,
  'toolRouter.session.search': async () =>
    (await import('@composio/client/effect/schemas/tool-router/session/search'))
      .SessionSearchResponse,
  'toolRouter.session.toolkits': async () =>
    (await import('@composio/client/effect/schemas/tool-router/session/toolkits'))
      .SessionToolkitsResponse,
  'tools.list': async () =>
    (await import('@composio/client/effect/schemas/tools/list')).ToolListResponse,
} satisfies SchemaLoaders;
