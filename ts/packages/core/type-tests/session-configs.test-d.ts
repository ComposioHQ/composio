/**
 * Type-level tests for saved Session configs.
 *
 * These tests fail the build (tsconfig.type-tests.json) if the public read
 * types drift from the generated client.
 */
import type {
  SessionConfigsListResponse,
  SessionConfigsRetrieveResponse,
} from '@composio/client/resources/session-configs';
import {
  Composio,
  experimental_createTool,
  experimental_createToolkit,
  SessionPreset,
  type SessionConfig,
  type SessionConfigListResponse,
  type SessionConfigPolicy,
  type SessionConfigSummary,
} from '../src';

declare const composio: Composio;

async function reads(): Promise<void> {
  const page: SessionConfigListResponse = await composio.sessionConfigs.list();
  const nextCursor: string | null = page.nextCursor;
  void nextCursor;
  await composio.sessionConfigs.list({ search: 'Daily', archived: true, limit: 50, cursor: 'c1' });
  // @ts-expect-error limit is a number
  await composio.sessionConfigs.list({ limit: '10' });

  const sessionConfig: SessionConfig = await composio.sessionConfigs.get('sc_1', {
    signal: new AbortController().signal,
  });
  const description: string | null = sessionConfig.description;
  void description;
}

// The SDK policy and the client policy are mutually assignable.
function policyMatchesClient(
  clientPolicy: SessionConfigsRetrieveResponse['config'],
  sdkPolicy: SessionConfigPolicy
): void {
  const _fromClient: SessionConfigPolicy = clientPolicy;
  const _toClient: SessionConfigsRetrieveResponse['config'] = sdkPolicy;
  void _fromClient;
  void _toClient;
}

// Every client list item field has a camelCased SDK counterpart.
function summaryMatchesClient(item: SessionConfigsListResponse.Item): SessionConfigSummary {
  return {
    id: item.id,
    name: item.name,
    archived: item.archived,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

// A saved Session config replaces the inline access fields on create. Each
// forbidden field is rejected on every create entry point.
declare const customTool: ReturnType<typeof experimental_createTool>;
declare const customToolkit: ReturnType<typeof experimental_createToolkit>;

async function createRejectsMixedInputs(): Promise<void> {
  const experimental = { sessionConfigId: 'sc_1' };

  // @ts-expect-error toolkits cannot be combined with sessionConfigId
  await composio.create('u', { toolkits: ['github'], experimental });
  // @ts-expect-error tools cannot be combined with sessionConfigId
  await composio.create('u', { tools: { github: ['GITHUB_GET_REPO'] }, experimental });
  // @ts-expect-error tags cannot be combined with sessionConfigId
  await composio.create('u', { tags: ['readOnlyHint'], experimental });
  await composio.create('u', {
    // @ts-expect-error customTools cannot be combined with sessionConfigId
    experimental: { sessionConfigId: 'sc_1', customTools: [customTool] },
  });
  await composio.create('u', {
    // @ts-expect-error customToolkits cannot be combined with sessionConfigId
    experimental: { sessionConfigId: 'sc_1', customToolkits: [customToolkit] },
  });

  // @ts-expect-error toolkits cannot be combined with sessionConfigId
  await composio.sessions.create('u', { toolkits: ['github'], experimental });
  // @ts-expect-error tools cannot be combined with sessionConfigId
  await composio.sessions.create('u', { tools: { github: ['GITHUB_GET_REPO'] }, experimental });
  // @ts-expect-error tags cannot be combined with sessionConfigId
  await composio.sessions.create('u', { tags: ['readOnlyHint'], experimental });
  await composio.sessions.create('u', {
    // @ts-expect-error customTools cannot be combined with sessionConfigId
    experimental: { sessionConfigId: 'sc_1', customTools: [customTool] },
  });
  await composio.sessions.create('u', {
    // @ts-expect-error customToolkits cannot be combined with sessionConfigId
    experimental: { sessionConfigId: 'sc_1', customToolkits: [customToolkit] },
  });

  // @ts-expect-error toolkits cannot be combined with sessionConfigId
  await composio.create('u', { mcp: true, toolkits: ['github'], experimental });
  // @ts-expect-error tools cannot be combined with sessionConfigId
  await composio.create('u', { mcp: true, tools: { github: ['GITHUB_GET_REPO'] }, experimental });
  // @ts-expect-error tags cannot be combined with sessionConfigId
  await composio.create('u', { mcp: true, tags: ['readOnlyHint'], experimental });
  await composio.create('u', {
    mcp: true,
    // @ts-expect-error customTools cannot be combined with sessionConfigId
    experimental: { sessionConfigId: 'sc_1', customTools: [customTool] },
  });
  await composio.create('u', {
    mcp: true,
    // @ts-expect-error customToolkits cannot be combined with sessionConfigId
    experimental: { sessionConfigId: 'sc_1', customToolkits: [customToolkit] },
  });
}

async function createFromSavedConfig(): Promise<void> {
  // `{ mcp: true }` still surfaces `session.mcp`.
  const mcpSession = await composio.create('u', {
    mcp: true,
    authConfigs: { github: 'ac_1' },
    experimental: { sessionConfigId: 'sc_1' },
  });
  const _url: string = mcpSession.mcp.url;
  void _url;

  const session = await composio.sessions.create('u', {
    experimental: { sessionConfigId: 'sc_1' },
  });
  // @ts-expect-error mcp is hidden from the type unless `{ mcp: true }` is passed
  void session.mcp;

  // Every per-session field stays allowed, with a trailing requestOptions.
  await composio.sessions.create(
    'u',
    {
      authConfigs: { github: 'ac_1' },
      connectedAccounts: { github: 'ca_1' },
      manageConnections: false,
      sandbox: { enable: false },
      multiAccount: { enable: true },
      preload: { tools: ['GITHUB_GET_REPO'] },
      sessionPreset: SessionPreset.DIRECT_TOOLS,
      experimental: { sessionConfigId: 'sc_1', assistivePrompt: { userTimezone: 'UTC' } },
    },
    { signal: new AbortController().signal }
  );
  await composio.create('u', {
    workbench: { enable: true },
    experimental: { sessionConfigId: 'sc_1' },
  });

  // An explicit `undefined` counts as absent.
  await composio.create('u', { toolkits: undefined, experimental: { sessionConfigId: 'sc_1' } });
}

async function createInline(): Promise<void> {
  await composio.create('u', {
    toolkits: ['github'],
    tools: { github: ['GITHUB_GET_REPO'] },
    tags: ['readOnlyHint'],
    experimental: { customTools: [customTool], customToolkits: [customToolkit] },
  });
  await composio.create('u', { mcp: true, toolkits: { disable: ['gmail'] } });
}

// On update, a saved Session config replaces toolkits, tools and tags.
// `null` counts as provided.
async function updateRejectsMixedInputs(): Promise<void> {
  const session = await composio.use('session_123');
  const experimental = { sessionConfigId: 'sc_1' };

  // @ts-expect-error toolkits cannot be combined with sessionConfigId
  await session.update({ toolkits: ['gmail'], experimental });
  // @ts-expect-error toolkits: null cannot be combined with sessionConfigId
  await session.update({ toolkits: null, experimental });
  // @ts-expect-error tools cannot be combined with sessionConfigId
  await session.update({ tools: { gmail: ['GMAIL_SEND_EMAIL'] }, experimental });
  // @ts-expect-error tools: null cannot be combined with sessionConfigId
  await session.update({ tools: null, experimental });
  // @ts-expect-error tags cannot be combined with sessionConfigId
  await session.update({ tags: ['readOnlyHint'], experimental });
  // @ts-expect-error tags: null cannot be combined with sessionConfigId
  await session.update({ tags: null, experimental });
}

async function updateWithSavedConfig(): Promise<void> {
  const session = await composio.use('session_123');
  await session.update({
    authConfigs: { github: 'ac_1' },
    preload: null,
    experimental: { sessionConfigId: 'sc_1', fastMode: true },
  });
  await session.update({ toolkits: undefined, experimental: { sessionConfigId: 'sc_1' } });
  await session.update({ toolkits: ['gmail'], experimental: { fastMode: true } });
  await session.update({ toolkits: null, experimental: null });
}

void reads;
void policyMatchesClient;
void summaryMatchesClient;
void createRejectsMixedInputs;
void createFromSavedConfig;
void createInline;
void updateRejectsMixedInputs;
void updateWithSavedConfig;
