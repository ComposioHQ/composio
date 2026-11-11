/**
 * Every route the fake backend answers.
 *
 * A route named after a `@composio/client` operation (`typed: true`) answers
 * with the shape that operation's response schema describes; the contract test
 * decodes each one with the client's own schema.
 */

import { z } from 'zod';
import { errorEnvelope } from './faults';
import { badRequest, notFound, singlePage, type Route, type RouteContext } from './route';
import {
  CONSUMER_PROJECT,
  CONSUMER_USER_ID,
  MEMBER,
  SEEDED_AT,
  SEEDED_EXPIRY,
  type AuthConfig,
  type Connection,
  type Release,
  type SeededProject,
  type SeededTool,
  type SeededToolkit,
  type World,
} from './world';

const LOGO = 'https://logos.composio.test/toolkit.svg';

// --- request bodies -----------------------------------------------------------

const SessionCreateBody = z.looseObject({ user_id: z.string() });
const SearchBody = z.looseObject({
  queries: z.array(z.looseObject({ use_case: z.string() })).optional(),
});
const ExecuteBody = z.looseObject({
  tool_slug: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  account: z.string().optional(),
});
const ExecuteMetaBody = z.looseObject({
  slug: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});
const SessionLinkBody = z.looseObject({ toolkit: z.string(), alias: z.string().optional() });
const LinkCreateBody = z.looseObject({
  auth_config_id: z.string(),
  user_id: z.string(),
  alias: z.string().optional(),
});
const DirectExecuteBody = z.looseObject({
  user_id: z.string().optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  connected_account_id: z.string().optional(),
});
const ApiKeyCreateBody = z.looseObject({ name: z.string() });
const TrpcBody = z.object({ json: z.record(z.string(), z.unknown()) });

// --- response builders --------------------------------------------------------

const projectDetails = (project: SeededProject, world: World) => ({
  auto_id: project.autoId,
  id: project.uuid,
  org_id: project.orgId,
  name: project.name,
  email: `${project.name}@projects.composio.test`,
  nano_id: project.nanoId,
  created_at: SEEDED_AT,
  updated_at: SEEDED_AT,
  webhook_url: null,
  event_webhook_url: null,
  webhook_secret: null,
  triggers_enabled: true,
  last_subscribed_at: null,
  deleted: false,
  is_new_webhook: true,
  webhook_version: 'V3',
  org: { id: world.org.id, name: world.org.name, plan: world.org.plan },
});

const toolkitListItem = (toolkit: SeededToolkit, world: World) => ({
  slug: toolkit.slug,
  name: toolkit.name,
  type: 'native',
  app: toolkit.slug,
  toolkit_type: 'api',
  is_local_toolkit: false,
  auth_schemes: toolkit.noAuth ? [] : ['OAUTH2'],
  composio_managed_auth_schemes: toolkit.noAuth ? [] : ['OAUTH2'],
  no_auth: toolkit.noAuth,
  deprecated: { toolkitId: `tk_${toolkit.slug}` },
  meta: {
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
    description: toolkit.description,
    logo: LOGO,
    categories: [],
    triggers_count: 0,
    tools_count: world.tools.filter(tool => tool.toolkit === toolkit.slug).length,
    version: toolkit.version,
    available_versions: [toolkit.version],
  },
});

const toolkitDetails = (toolkit: SeededToolkit, world: World) => ({
  slug: toolkit.slug,
  name: toolkit.name,
  type: 'native',
  enabled: true,
  no_auth: toolkit.noAuth,
  composio_managed_auth_schemes: toolkit.noAuth ? [] : ['OAUTH2'],
  composio_managed_auth: toolkit.noAuth ? [] : [{ mode: 'OAUTH2', scopes: { available: [] } }],
  is_local_toolkit: false,
  auth_config_details: toolkit.noAuth
    ? []
    : [
        {
          mode: 'OAUTH2',
          name: 'OAuth 2.0',
          required_scopes: [],
          fields: {
            auth_config_creation: { required: [], optional: [] },
            connected_account_initiation: { required: [], optional: [] },
          },
        },
      ],
  meta: {
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
    description: toolkit.description,
    logo: LOGO,
    categories: [],
    triggers_count: 0,
    tools_count: world.tools.filter(tool => tool.toolkit === toolkit.slug).length,
    version: toolkit.version,
    available_versions: [toolkit.version],
  },
  deprecated: { toolkitId: `tk_${toolkit.slug}`, rawProxyInfoByAuthSchemes: [] },
});

const toolDetails = (tool: SeededTool, world: World) => {
  const toolkit = world.findToolkit(tool.toolkit);
  const version = toolkit?.version ?? 'latest';
  return {
    slug: tool.slug,
    name: tool.name,
    description: tool.description,
    toolkit: { slug: tool.toolkit, name: toolkit?.name ?? tool.toolkit, logo: LOGO },
    input_parameters: tool.inputParameters,
    no_auth: toolkit?.noAuth ?? false,
    available_versions: [version],
    version,
    output_parameters: { type: 'object', properties: {} },
    scopes: [],
    scope_requirements: null,
    tags: [],
    is_deprecated: false,
    deprecated: {
      displayName: tool.name,
      version,
      available_versions: [version],
      is_deprecated: false,
      toolkit: { logo: LOGO },
    },
  };
};

const connectedAccount = (connection: Connection, urls: RouteContext['urls']) => {
  if (connection.status === 'ACTIVE') connection.reportedActive = true;
  return {
    toolkit: { slug: connection.toolkit },
    auth_config: {
      id: connection.authConfigId,
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    id: connection.id,
    word_id: connection.wordId,
    alias: connection.alias,
    user_id: connection.userId,
    status: connection.status,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
    state:
      connection.status === 'ACTIVE'
        ? {
            authScheme: 'OAUTH2',
            val: { status: 'ACTIVE', access_token: 'REDACTED', token_type: 'Bearer' },
          }
        : {
            authScheme: 'OAUTH2',
            val: { status: 'INITIATED', redirectUrl: redirectUrl(urls, connection) },
          },
    data: {},
    params: {},
    status_reason: null,
    is_disabled: false,
    test_request_endpoint: '',
    deprecated: { labels: [], uuid: `00000000-0000-4000-8000-${connection.id.padStart(12, '0')}` },
  };
};

const authConfigItem = (authConfig: AuthConfig, world: World) => ({
  id: authConfig.id,
  uuid: authConfig.uuid,
  type: 'default',
  toolkit: { slug: authConfig.toolkit, logo: LOGO },
  name: authConfig.name,
  auth_scheme: 'OAUTH2',
  is_composio_managed: true,
  status: 'ENABLED',
  created_by: MEMBER.id,
  created_at: SEEDED_AT,
  last_updated_at: SEEDED_AT,
  no_of_connections: world.connections.filter(c => c.authConfigId === authConfig.id).length,
  tool_access_config: {
    tools_for_connected_account_creation: [],
    tools_available_for_execution: [],
  },
});

const redirectUrl = (urls: RouteContext['urls'], connection: Connection) =>
  `${urls.backend}/api/v3/s/${connection.id}`;

const noActiveConnection = (toolkit: string) => ({
  status: 400,
  json: errorEnvelope({
    status: 400,
    code: 4302,
    slug: 'ToolRouterV2_NoActiveConnection',
    message: `No active connection found for toolkit ${toolkit}`,
    suggestedFix: `Connect ${toolkit} before executing this tool`,
  }),
});

const unknownTool = (slug: string) => notFound(`Tool ${slug} not found`, 'Tool_ToolNotFound');

/** The session named in the path, with the project and user it was created for. */
const sessionOf = (context: RouteContext) =>
  context.world.toolRouterSessions.find(session => session.id === context.params.sessionId);

const unknownSession = (context: RouteContext) =>
  notFound(
    `Tool router session ${context.params.sessionId} not found`,
    'ToolRouterV2_SessionNotFound'
  );

/**
 * Runs a tool for a user on a project: the connection check and the tool's
 * canned answer. Shared by the session, Dashboard, and direct execute routes.
 */
const runTool = (
  world: World,
  params: { projectLabel: string; userId: string; slug: string; args: Record<string, unknown> }
):
  | { kind: 'unknown-tool' }
  | { kind: 'not-connected'; toolkit: string }
  | { kind: 'ran'; data: Record<string, unknown>; logId: string } => {
  const tool = world.findTool(params.slug);
  if (!tool) return { kind: 'unknown-tool' };
  const toolkit = world.findToolkit(tool.toolkit);
  if (
    !toolkit?.noAuth &&
    !world.reportActiveConnection(params.projectLabel, params.userId, tool.toolkit)
  ) {
    return { kind: 'not-connected', toolkit: tool.toolkit };
  }
  return { kind: 'ran', data: tool.respond(params.args), logId: world.nextLogId() };
};

const searchResponse = (
  context: RouteContext,
  session: { id: string; projectLabel: string; userId: string },
  useCases: ReadonlyArray<string>
) => {
  const { world } = context;
  const matches = useCases.map(useCase => {
    const words = useCase
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length > 2);
    const tools = world.tools.filter(tool => {
      const haystack =
        `${tool.slug} ${tool.name} ${tool.description} ${tool.toolkit}`.toLowerCase();
      return words.some(word => haystack.includes(word));
    });
    // Toolkit names outrank incidental word overlap ("send" matches Slack and Gmail).
    const named = tools.filter(tool => words.includes(tool.toolkit));
    return { useCase, tools: named.length > 0 ? named : tools };
  });
  const toolkits = [...new Set(matches.flatMap(match => match.tools.map(tool => tool.toolkit)))];
  const allTools = [...new Set(matches.flatMap(match => match.tools))];

  return {
    success: true,
    error: null,
    results: matches.map((match, index) => ({
      index: index + 1,
      use_case: match.useCase,
      execution_guidance: 'Execute the primary tool with the documented arguments.',
      primary_tool_slugs: match.tools.slice(0, 1).map(tool => tool.slug),
      related_tool_slugs: match.tools.slice(1).map(tool => tool.slug),
      toolkits: [...new Set(match.tools.map(tool => tool.toolkit))],
    })),
    toolkit_connection_statuses: toolkits.map(slug => {
      const toolkit = world.findToolkit(slug);
      const connection = world.reportActiveConnection(session.projectLabel, session.userId, slug);
      const connected = toolkit?.noAuth === true || connection !== undefined;
      return {
        toolkit: slug,
        description: toolkit?.description ?? '',
        has_active_connection: connected,
        status_message: connected
          ? `${slug} is connected`
          : `No active connection for ${slug}. Initiate a connection before executing its tools.`,
      };
    }),
    tool_schemas: Object.fromEntries(
      allTools.map(tool => [
        tool.slug,
        {
          tool_slug: tool.slug,
          toolkit: tool.toolkit,
          description: tool.description,
          input_schema: tool.inputParameters,
          hasFullSchema: true,
        },
      ])
    ),
    time_info: {
      current_time_utc: SEEDED_AT,
      current_time_utc_epoch_seconds: Date.parse(SEEDED_AT) / 1000,
      message: 'Fixed time of the fake backend.',
    },
    session: { id: session.id, generate_id: false, instructions: 'Reuse this session id.' },
    next_steps_guidance: ['Execute the primary tool slug for each use case.'],
  };
};

// --- routes -------------------------------------------------------------------

const backend = (route: Omit<Route, 'role'>): Route => ({ ...route, role: 'backend' });

const ACCOUNT_ROUTES: ReadonlyArray<Route> = [
  backend({
    name: 'auth.session.retrieveInfo',
    method: 'GET',
    path: '/api/:v/auth/session/info',
    typed: true,
    auth: 'user',
    handle: ({ world, project }) => ({
      json: {
        // A user key belongs to no project, so the org's default developer
        // project is reported, never the consumer project: a command that
        // reuses this id instead of resolving the consumer project shows up in
        // the journal as acting on the wrong project.
        project: projectDetails(project ?? world.defaultProject, world),
        api_key: null,
        org_member: {
          id: world.member.id,
          email: world.member.email,
          name: world.member.name,
          role: world.member.role,
          metadata: {},
        },
      },
    }),
  }),
  backend({
    name: 'org.list',
    method: 'GET',
    path: '/api/:v/org/list',
    typed: true,
    auth: 'user',
    handle: ({ world }) => ({
      json: {
        organizations: world.organizations.map(org => ({
          id: org.id,
          name: org.name,
          created_at: SEEDED_AT,
          updated_at: SEEDED_AT,
        })),
        next_cursor: null,
        total_pages: 1,
        current_page: 1,
        total_items: world.organizations.length,
      },
    }),
  }),
  backend({
    name: 'org.project.list',
    method: 'GET',
    path: '/api/:v/org/project/list',
    typed: true,
    auth: 'user',
    handle: ({ world, identity }) => {
      const projects = world.projects.filter(
        project =>
          project.kind === 'developer' && project.orgId === (identity.orgId ?? world.org.id)
      );
      return {
        json: {
          data: projects.map(project => ({
            id: project.nanoId,
            org_id: project.orgId,
            name: project.name,
            email: `${project.name}@projects.composio.test`,
            created_at: SEEDED_AT,
            updated_at: SEEDED_AT,
            webhook_url: null,
            event_webhook_url: null,
            webhook_secret: null,
            triggers_enabled: true,
            last_subscribed_at: null,
            is_new_webhook: true,
            webhook_version: 'V3',
            deleted: false,
          })),
          next_cursor: null,
          total_pages: 1,
          current_page: 1,
          total_items: projects.length,
        },
      };
    },
  }),
  backend({
    name: 'org.project.apiKeys.create',
    method: 'POST',
    path: '/api/:v/org/project/:projectId/api_keys/create',
    typed: false,
    auth: 'user',
    handle: ({ world, params, body }) => {
      const project = world.findProject(params.projectId);
      if (!project) return notFound(`Project ${params.projectId} not found`, 'Project_NotFound');
      const { name } = ApiKeyCreateBody.parse(body);
      const key = world.mintProjectKey(project.label, name);
      return {
        json: { id: `key_${world.mintedProjectKeys.length}`, name, key, created_at: SEEDED_AT },
        acted: { project: project.label },
      };
    },
  }),
  backend({
    name: '_internal.org.consumer.project.resolve',
    method: 'POST',
    path: '/api/:v/org/consumer/project/resolve',
    typed: true,
    auth: 'user',
    handle: ({ identity }) => ({
      json: {
        project_id: CONSUMER_PROJECT.uuid,
        project_nano_id: CONSUMER_PROJECT.nanoId,
        project_name: CONSUMER_PROJECT.name,
        org_id: identity.orgId ?? CONSUMER_PROJECT.orgId,
        project_type: 'CONSUMER',
        config: {
          consumer_experience_enabled: true,
          enhanced_controls: false,
          enable_instant: false,
        },
        consumer_user_id: CONSUMER_USER_ID,
        user_id: MEMBER.id,
      },
      acted: { project: CONSUMER_PROJECT.label, userId: CONSUMER_USER_ID },
    }),
  }),
  backend({
    name: '_internal.org.consumer.listConnectedToolkits',
    method: 'GET',
    path: '/api/:v/org/consumer/connected_toolkits',
    typed: true,
    auth: 'user',
    handle: ({ world, query }) => {
      const userId = query.get('user_id') ?? CONSUMER_USER_ID;
      const toolkits = world.connections
        .filter(
          connection =>
            connection.projectLabel === CONSUMER_PROJECT.label &&
            connection.userId === userId &&
            connection.status === 'ACTIVE'
        )
        .map(connection => connection.toolkit);
      return {
        json: { toolkits: [...new Set(toolkits)] },
        acted: { project: CONSUMER_PROJECT.label, userId },
      };
    },
  }),
  backend({
    name: '_internal.org.consumer.retrieveConfig',
    method: 'GET',
    path: '/api/:v/org/consumer/config',
    typed: true,
    auth: 'user',
    handle: ({ world, identity }) => ({
      json: {
        org_id: identity.orgId ?? world.org.id,
        consumer_experience_enabled: true,
        enhanced_controls: false,
      },
    }),
  }),
  backend({
    name: '_internal.consumer.permissions.resolve',
    method: 'POST',
    path: '/api/:v/consumer/permissions/resolve',
    typed: true,
    auth: 'user',
    handle: () => ({
      json: { experimental: { permissions: { default: 'allow_all', overrides: {} } } },
    }),
  }),
];

const LOGIN_ROUTES: ReadonlyArray<Route> = [
  backend({
    name: '_internal.cli.createSession',
    method: 'POST',
    path: '/api/:v/cli/create-session',
    typed: true,
    auth: 'none',
    handle: ({ world }) => {
      const session = world.createLoginSession();
      return {
        json: {
          id: session.id,
          code: session.code,
          expiresAt: SEEDED_EXPIRY,
          status: session.status,
          scope: 'user',
        },
      };
    },
  }),
  backend({
    name: '_internal.cli.getSession',
    method: 'GET',
    path: '/api/:v/cli/get-session',
    typed: true,
    auth: 'none',
    handle: ({ world, query }) => {
      const reference = query.get('id') ?? query.get('code') ?? '';
      const session = world.loginSessions.find(s => s.id === reference || s.code === reference);
      if (!session) return notFound(`CLI session ${reference} not found`, 'Cli_SessionNotFound');
      const linked = session.status === 'linked';
      if (linked) session.reportedLinked = true;
      return {
        json: {
          id: session.id,
          code: session.code,
          status: session.status,
          expiresAt: SEEDED_EXPIRY,
          account: linked
            ? { id: world.member.id, email: world.member.email, name: world.member.name }
            : null,
          api_key: linked ? world.userApiKey : null,
          scope: 'user',
        },
      };
    },
  }),
  backend({
    // The page a link's `redirect_url` points at. Whoever opens it is the
    // account's owner at the consent screen, and opening it is their approval.
    name: 'connectedAccounts.authorizationPage',
    method: 'GET',
    path: '/api/:v/s/:id',
    typed: false,
    auth: 'none',
    handle: ({ world, params }) =>
      world.authorizeConnection(params.id ?? '')
        ? { text: 'Authorized. You can close this tab.' }
        : notFound(`No pending authorization ${params.id}`, 'ConnectedAccount_NotFound'),
  }),
  backend({
    name: 'cli.analytics',
    method: 'POST',
    path: '/api/:v/cli/analytics',
    typed: false,
    auth: 'none',
    handle: () => ({ status: 204 }),
  }),
];

const CATALOG_ROUTES: ReadonlyArray<Route> = [
  backend({
    name: 'toolkits.list',
    method: 'GET',
    path: '/api/:v/toolkits',
    typed: true,
    auth: 'key',
    handle: ({ world, query }) => {
      const search = query.get('search')?.toLowerCase();
      const items = world.toolkits
        .filter(toolkit => !search || toolkit.slug.startsWith(search))
        .map(toolkit => toolkitListItem(toolkit, world));
      return { json: singlePage(items) };
    },
  }),
  backend({
    name: 'toolkits.retrieve',
    method: 'GET',
    path: '/api/:v/toolkits/:slug',
    typed: true,
    auth: 'key',
    handle: ({ world, params }) => {
      const toolkit = world.findToolkit(params.slug ?? '');
      return toolkit
        ? { json: toolkitDetails(toolkit, world) }
        : notFound(`Toolkit ${params.slug} not found`, 'Toolkit_NotFound');
    },
  }),
  backend({
    name: 'tools.list',
    method: 'GET',
    path: '/api/:v/tools',
    typed: true,
    auth: 'key',
    handle: ({ world, query }) => {
      const toolkit = query.get('toolkit_slug')?.toLowerCase();
      const slugs = query.get('tool_slugs')?.toUpperCase().split(',');
      const items = world.tools
        .filter(tool => !toolkit || tool.toolkit === toolkit)
        .filter(tool => !slugs || slugs.includes(tool.slug))
        .map(tool => toolDetails(tool, world));
      return { json: singlePage(items) };
    },
  }),
  backend({
    name: 'tools.getLatestVersion',
    method: 'GET',
    path: '/api/:v/tools/:slug/get_latest_version',
    typed: false,
    auth: 'key',
    handle: ({ world, params }) => {
      const tool = world.findTool(params.slug ?? '');
      if (!tool) return unknownTool(params.slug ?? '');
      return {
        json: {
          slug: tool.slug,
          toolkit: tool.toolkit,
          version: world.findToolkit(tool.toolkit)?.version ?? 'latest',
        },
      };
    },
  }),
  backend({
    name: 'tools.retrieve',
    method: 'GET',
    path: '/api/:v/tools/:slug',
    typed: true,
    auth: 'key',
    handle: ({ world, params }) => {
      const tool = world.findTool(params.slug ?? '');
      return tool ? { json: toolDetails(tool, world) } : unknownTool(params.slug ?? '');
    },
  }),
];

const SESSION_ROUTES: ReadonlyArray<Route> = [
  backend({
    name: 'toolRouter.session.create',
    method: 'POST',
    path: '/api/:v/tool_router/session',
    typed: true,
    auth: 'project',
    handle: ({ world, body, project, urls }) => {
      const { user_id: userId } = SessionCreateBody.parse(body);
      const session = world.createToolRouterSession(project!.label, userId);
      return {
        status: 201,
        json: {
          session_id: session.id,
          mcp: { type: 'http', url: `${urls.backend}/tool_router/${session.id}/mcp` },
          tool_router_tools: ['COMPOSIO_SEARCH_TOOLS', 'COMPOSIO_MULTI_EXECUTE_TOOL'],
          config: {
            user_id: userId,
            instant: false,
            preload: { tools: [] },
            search: { enable: true },
            execute: { enable_multi_execute: true },
          },
          config_version: 1,
        },
        acted: { project: project!.label, userId },
      };
    },
  }),
  backend({
    name: 'toolRouter.session.search',
    method: 'POST',
    path: '/api/:v/tool_router/session/:sessionId/search',
    typed: true,
    auth: 'project',
    handle: context => {
      const session = sessionOf(context);
      if (!session) return unknownSession(context);
      const { queries } = SearchBody.parse(context.body);
      return {
        json: searchResponse(
          context,
          session,
          (queries ?? []).map(query => query.use_case)
        ),
        acted: { project: session.projectLabel, userId: session.userId },
      };
    },
  }),
  backend({
    name: 'toolRouter.session.execute',
    method: 'POST',
    path: '/api/:v/tool_router/session/:sessionId/execute',
    typed: true,
    auth: 'project',
    handle: context => {
      const session = sessionOf(context);
      if (!session) return unknownSession(context);
      const request = ExecuteBody.parse(context.body);
      const acted = { project: session.projectLabel, userId: session.userId };
      const outcome = runTool(context.world, {
        projectLabel: session.projectLabel,
        userId: session.userId,
        slug: request.tool_slug,
        args: request.arguments ?? {},
      });
      if (outcome.kind === 'unknown-tool') return { ...unknownTool(request.tool_slug), acted };
      if (outcome.kind === 'not-connected')
        return { ...noActiveConnection(outcome.toolkit), acted };
      return {
        json: { result_type: 'completed', data: outcome.data, error: null, log_id: outcome.logId },
        acted,
        effect: 'tool-executed',
        tool: { slug: request.tool_slug, arguments: request.arguments ?? {} },
      };
    },
  }),
  backend({
    name: 'toolRouter.session.executeMeta',
    method: 'POST',
    path: '/api/:v/tool_router/session/:sessionId/execute_meta',
    typed: true,
    auth: 'project',
    handle: context => {
      const session = sessionOf(context);
      if (!session) return unknownSession(context);
      const request = ExecuteMetaBody.parse(context.body);
      return {
        json: {
          result_type: 'completed',
          data: { slug: request.slug, echoed_arguments: request.arguments ?? {} },
          error: null,
          log_id: context.world.nextLogId(),
        },
        acted: { project: session.projectLabel, userId: session.userId },
      };
    },
  }),
  backend({
    name: 'toolRouter.session.link',
    method: 'POST',
    path: '/api/:v/tool_router/session/:sessionId/link',
    typed: true,
    auth: 'project',
    handle: context => {
      const session = sessionOf(context);
      if (!session) return unknownSession(context);
      const request = SessionLinkBody.parse(context.body);
      const toolkit = context.world.findToolkit(request.toolkit);
      if (!toolkit) return notFound(`Toolkit ${request.toolkit} not found`, 'Toolkit_NotFound');
      const connection = context.world.beginConnection({
        projectLabel: session.projectLabel,
        userId: session.userId,
        toolkit: toolkit.slug,
        alias: request.alias,
      });
      return {
        status: 201,
        json: {
          link_token: `lt_${connection.id}`,
          redirect_url: redirectUrl(context.urls, connection),
          connected_account_id: connection.id,
        },
        acted: { project: session.projectLabel, userId: session.userId },
        effect: 'connection-started',
      };
    },
  }),
  backend({
    name: 'toolRouter.session.toolkits',
    method: 'GET',
    path: '/api/:v/tool_router/session/:sessionId/toolkits',
    typed: true,
    auth: 'project',
    handle: context => {
      const session = sessionOf(context);
      if (!session) return unknownSession(context);
      const { world } = context;
      const wanted = context.query.get('toolkits')?.toLowerCase().split(',');
      const items = world.toolkits
        .filter(toolkit => !wanted || wanted.includes(toolkit.slug))
        .map(toolkit => {
          const connection = world.reportActiveConnection(
            session.projectLabel,
            session.userId,
            toolkit.slug
          );
          return {
            name: toolkit.name,
            slug: toolkit.slug,
            enabled: true,
            is_no_auth: toolkit.noAuth,
            composio_managed_auth_schemes: toolkit.noAuth ? [] : ['OAUTH2'],
            meta: { logo: LOGO, description: toolkit.description },
            connected_account: connection
              ? {
                  id: connection.id,
                  user_id: connection.userId,
                  status: connection.status,
                  created_at: SEEDED_AT,
                  auth_config: {
                    id: connection.authConfigId,
                    auth_scheme: 'OAUTH2',
                    is_composio_managed: true,
                  },
                }
              : null,
          };
        });
      return {
        json: singlePage(items),
        acted: { project: session.projectLabel, userId: session.userId },
      };
    },
  }),
];

const DEVELOPER_ROUTES: ReadonlyArray<Route> = [
  backend({
    name: 'authConfigs.list',
    method: 'GET',
    path: '/api/:v/auth_configs',
    typed: true,
    auth: 'project',
    handle: ({ world, project, query }) => {
      const toolkit = query.get('toolkit_slug')?.toLowerCase();
      const items = world.authConfigs
        .filter(authConfig => authConfig.projectLabel === project!.label)
        .filter(authConfig => !toolkit || authConfig.toolkit === toolkit)
        .map(authConfig => authConfigItem(authConfig, world));
      return { json: singlePage(items) };
    },
  }),
  backend({
    name: 'authConfigs.retrieve',
    method: 'GET',
    path: '/api/:v/auth_configs/:id',
    typed: true,
    auth: 'project',
    handle: ({ world, project, params }) => {
      const authConfig = world.authConfigs.find(
        candidate => candidate.id === params.id && candidate.projectLabel === project!.label
      );
      return authConfig
        ? { json: authConfigItem(authConfig, world) }
        : notFound(`Auth config ${params.id} not found`, 'AuthConfig_NotFound');
    },
  }),
  backend({
    name: 'connectedAccounts.list',
    method: 'GET',
    path: '/api/:v/connected_accounts',
    typed: true,
    auth: 'project',
    handle: ({ world, project, query, urls }) => {
      const userIds = query.getAll('user_ids').flatMap(value => value.split(','));
      const toolkits = query.getAll('toolkit_slugs').flatMap(value => value.split(','));
      const statuses = query.getAll('statuses').flatMap(value => value.split(','));
      const items = world.connections
        .filter(connection => connection.projectLabel === project!.label)
        .filter(connection => userIds.length === 0 || userIds.includes(connection.userId))
        .filter(connection => toolkits.length === 0 || toolkits.includes(connection.toolkit))
        .filter(connection => statuses.length === 0 || statuses.includes(connection.status))
        .map(connection => connectedAccount(connection, urls));
      return {
        json: singlePage(items),
        acted: { userId: userIds.length === 1 ? (userIds[0] ?? null) : null },
      };
    },
  }),
  backend({
    name: 'connectedAccounts.retrieve',
    method: 'GET',
    path: '/api/:v/connected_accounts/:id',
    typed: true,
    auth: 'project',
    handle: ({ world, project, params, urls }) => {
      const connection = world.connections.find(
        candidate => candidate.id === params.id && candidate.projectLabel === project!.label
      );
      if (connection) world.pollConnection(connection);
      return connection
        ? { json: connectedAccount(connection, urls), acted: { userId: connection.userId } }
        : notFound(`Connected account ${params.id} not found`, 'ConnectedAccount_NotFound');
    },
  }),
  backend({
    name: 'link.create',
    method: 'POST',
    path: '/api/:v/connected_accounts/link',
    typed: true,
    auth: 'project',
    handle: ({ world, project, body, urls }) => {
      const request = LinkCreateBody.parse(body);
      const authConfig = world.authConfigs.find(
        candidate =>
          candidate.id === request.auth_config_id && candidate.projectLabel === project!.label
      );
      if (!authConfig) {
        return notFound(`Auth config ${request.auth_config_id} not found`, 'AuthConfig_NotFound');
      }
      const connection = world.beginConnection({
        projectLabel: project!.label,
        userId: request.user_id,
        toolkit: authConfig.toolkit,
        alias: request.alias,
      });
      return {
        status: 201,
        json: {
          link_token: `lt_${connection.id}`,
          redirect_url: redirectUrl(urls, connection),
          expires_at: SEEDED_EXPIRY,
          connected_account_id: connection.id,
        },
        acted: { userId: request.user_id },
        effect: 'connection-started',
      };
    },
  }),
  backend({
    name: 'tools.execute',
    method: 'POST',
    path: '/api/:v/tools/execute/:slug',
    typed: true,
    auth: 'project',
    handle: ({ world, project, params, body }) => {
      const request = DirectExecuteBody.parse(body);
      const slug = params.slug ?? '';
      const userId =
        request.user_id ??
        world.connections.find(connection => connection.id === request.connected_account_id)
          ?.userId ??
        '';
      const acted = { userId: userId === '' ? null : userId };
      const outcome = runTool(world, {
        projectLabel: project!.label,
        userId,
        slug,
        args: request.arguments ?? {},
      });
      if (outcome.kind === 'unknown-tool') return { ...unknownTool(slug), acted };
      if (outcome.kind === 'not-connected') {
        return {
          status: 400,
          json: errorEnvelope({
            status: 400,
            code: 4302,
            slug: 'ActionExecute_ConnectedAccountNotFound',
            message: `No connected account found for user ${userId} and toolkit ${outcome.toolkit}`,
          }),
          acted,
        };
      }
      return {
        json: { data: outcome.data, error: null, successful: true, log_id: outcome.logId },
        acted,
        effect: 'tool-executed',
        tool: { slug, arguments: request.arguments ?? {} },
      };
    },
  }),
];

/**
 * The Dashboard procedures behind consumer `composio execute`. The Dashboard
 * resolves the consumer project and the consumer user from the login, runs the
 * tool on the backend, and relays the backend's answer inside a tRPC envelope.
 */
const trpcReply = (outcome: unknown) => ({ result: { data: { json: outcome } } });

const DASHBOARD_ROUTES: ReadonlyArray<Route> = [
  {
    name: 'dashboard.execute',
    role: 'dashboard',
    method: 'POST',
    path: '/api/cli/trpc/execute',
    typed: false,
    auth: 'none',
    handle: ({ world, identity, body }) => {
      const acted = { project: CONSUMER_PROJECT.label, userId: CONSUMER_USER_ID };
      if (identity.keyClass !== 'user' || !identity.keyKnown) {
        return {
          status: 401,
          json: {
            error: {
              json: {
                message: 'Invalid or expired credentials',
                code: -32001,
                data: { code: 'UNAUTHORIZED', httpStatus: 401 },
              },
            },
          },
          acted,
        };
      }
      const request = ExecuteBody.parse(TrpcBody.parse(body).json);
      const outcome = runTool(world, {
        projectLabel: CONSUMER_PROJECT.label,
        userId: CONSUMER_USER_ID,
        slug: request.tool_slug,
        args: request.arguments ?? {},
      });
      if (outcome.kind === 'unknown-tool') {
        const failure = unknownTool(request.tool_slug);
        return {
          json: trpcReply({
            ok: false,
            status: 404,
            error: z.object({ error: z.unknown() }).parse(failure.json).error,
          }),
          acted,
        };
      }
      if (outcome.kind === 'not-connected') {
        const failure = noActiveConnection(outcome.toolkit);
        return {
          json: trpcReply({ ok: false, status: failure.status, error: failure.json.error }),
          acted,
        };
      }
      return {
        json: trpcReply({
          ok: true,
          response: {
            result_type: 'completed',
            data: outcome.data,
            error: null,
            log_id: outcome.logId,
          },
        }),
        acted,
        effect: 'tool-executed',
        tool: { slug: request.tool_slug, arguments: request.arguments ?? {} },
      };
    },
  },
  {
    name: 'dashboard.executeMeta',
    role: 'dashboard',
    method: 'POST',
    path: '/api/cli/trpc/executeMeta',
    typed: false,
    auth: 'none',
    handle: ({ world, body }) => {
      const request = ExecuteMetaBody.parse(TrpcBody.parse(body).json);
      return {
        json: trpcReply({
          ok: true,
          response: {
            result_type: 'completed',
            data: { slug: request.slug, echoed_arguments: request.arguments ?? {} },
            error: null,
            log_id: world.nextLogId(),
          },
        }),
        acted: { project: CONSUMER_PROJECT.label, userId: CONSUMER_USER_ID },
      };
    },
  },
];

const AGENT_IDENTITY = {
  status: 'READY',
  slug: 'e2e-agent',
  email: 'e2e-agent@agent.composio.test',
  composio_agent_key: 'cak_e2e_agent_key_0001',
  composio: {
    member_id: 'mem_e2e_agent',
    org_id: 'ok_e2eagent0001',
    project_id: 'pr_e2eagent00001',
    user_api_key: 'uak_e2e_agent_user_key',
  },
} as const;

const AGENT_ROUTES: ReadonlyArray<Route> = [
  {
    name: 'agents.signup',
    role: 'agents',
    method: 'POST',
    path: '/api/signup',
    typed: false,
    auth: 'none',
    handle: () => ({ json: AGENT_IDENTITY }),
  },
  {
    name: 'agents.whoami',
    role: 'agents',
    method: 'GET',
    path: '/api/whoami',
    typed: false,
    auth: 'none',
    handle: ({ identity }) =>
      identity.key === AGENT_IDENTITY.composio_agent_key
        ? { json: AGENT_IDENTITY }
        : { status: 401, json: { message: 'unauthorized' } },
  },
];

const releaseJson = (release: Release, baseUrl: string) => ({
  tag_name: release.tag,
  draft: false,
  prerelease: release.prerelease,
  assets: release.assets.map(asset => ({
    name: asset.name,
    browser_download_url: `${baseUrl}/ComposioHQ/composio/releases/download/${encodeURIComponent(release.tag)}/${asset.name}`,
  })),
});

const RELEASE_ROUTES: ReadonlyArray<Route> = [
  {
    name: 'github.releases.list',
    role: 'github-api',
    method: 'GET',
    path: '/repos/:owner/:repo/releases',
    typed: false,
    auth: 'none',
    handle: ({ world, urls }) => ({
      json: world.releases.map(release => releaseJson(release, urls.backend)),
    }),
  },
  {
    name: 'github.releases.byTag',
    role: 'github-api',
    method: 'GET',
    path: '/repos/:owner/:repo/releases/tags/:tag',
    typed: false,
    auth: 'none',
    handle: ({ world, params, urls }) => {
      const release = world.releases.find(candidate => candidate.tag === params.tag);
      return release
        ? { json: releaseJson(release, urls.backend) }
        : { status: 404, json: { message: 'Not Found', status: '404' } };
    },
  },
  {
    name: 'github.releases.download',
    role: 'github-download',
    method: 'GET',
    path: '/:owner/:repo/releases/download/:tag/:asset',
    typed: false,
    auth: 'none',
    handle: ({ world, params }) => {
      const asset = world.releases
        .find(candidate => candidate.tag === params.tag)
        ?.assets.find(candidate => candidate.name === params.asset);
      return asset ? { bytes: asset.read() } : { status: 404, text: 'Not Found\n' };
    },
  },
];

const TELEMETRY_ROUTES: ReadonlyArray<Route> = [
  {
    name: 'posthog.capture',
    role: 'posthog',
    method: 'POST',
    path: '/posthog/i/v0/e/',
    typed: false,
    auth: 'none',
    handle: () => ({ json: { status: 1 } }),
  },
];

export const ROUTES: ReadonlyArray<Route> = [
  ...ACCOUNT_ROUTES,
  ...LOGIN_ROUTES,
  ...CATALOG_ROUTES,
  ...SESSION_ROUTES,
  ...DEVELOPER_ROUTES,
  ...DASHBOARD_ROUTES,
  ...AGENT_ROUTES,
  ...RELEASE_ROUTES,
  ...TELEMETRY_ROUTES,
];

export { AGENT_IDENTITY };
