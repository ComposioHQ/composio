import { Command, Options } from '@effect/cli';
import { Console, Effect, Option } from 'effect';
import { deriveToolkitSlugFromActionSlug } from './_shared/derive-toolkit-from-slug';
import { parseBooleanOption } from './_shared/parse-boolean-option';
import { parseCsvOption } from './_shared/parse-csv-options';
import { parseToolkitMapOption } from './_shared/parse-toolkit-map-option';
import { ComposioEntitiesRepository } from 'src/services/composio-entities';

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return null;
}

function asString(input: unknown): string | undefined {
  return typeof input === 'string' ? input : undefined;
}

const userIdOpt = Options.optional(Options.text('user_id')).pipe(
  Options.withDescription(
    'User id for the session. If omitted, falls back to COMPOSIO_TEST_USER_ID environment variable.'
  )
);

const toolkitsOpt = Options.optional(Options.text('toolkits')).pipe(
  Options.withDescription(
    'Comma-separated toolkit slugs to allow in the session (example: "gmail,slack").'
  )
);

const toolsOpt = Options.optional(Options.text('tools')).pipe(
  Options.withDescription(
    'Comma-separated tool slugs to allow. Tools are automatically grouped by toolkit prefix (example: "GMAIL_SEND_EMAIL,SLACK_SEND_MESSAGE").'
  )
);

const manageConnectionsOpt = Options.optional(Options.text('manage_connections')).pipe(
  Options.withDescription(
    'Whether connection management tools are enabled. Accepted values: true, false, 1, 0.'
  )
);

const authConfigsOpt = Options.optional(Options.text('auth_configs')).pipe(
  Options.withDescription(
    'Toolkit-to-auth-config mapping as comma-separated entries in toolkit<>auth_config_id format.'
  )
);

const connectedAccountsOpt = Options.optional(Options.text('connected_accounts')).pipe(
  Options.withDescription(
    'Toolkit-to-connected-account mapping as comma-separated entries in toolkit<>connected_account_id format.'
  )
);

const jsonOpt = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print machine-readable JSON output for agent/tool consumption.')
);

function buildToolsConfig(
  toolSlugs: ReadonlyArray<string>
): Effect.Effect<Record<string, { enable: Array<string> }> | undefined, Error> {
  return Effect.gen(function* () {
    if (toolSlugs.length === 0) {
      return undefined;
    }

    const groupedTools: Record<string, { enable: Array<string> }> = {};

    for (const toolSlug of toolSlugs) {
      const toolkitSlug = deriveToolkitSlugFromActionSlug(toolSlug);
      if (!toolkitSlug) {
        return yield* Effect.fail(
          new Error(
            `Could not infer toolkit from tool slug "${toolSlug}". Expected slugs like TOOLKIT_ACTION_NAME.`
          )
        );
      }

      if (!groupedTools[toolkitSlug]) {
        groupedTools[toolkitSlug] = { enable: [] };
      }
      groupedTools[toolkitSlug].enable.push(toolSlug);
    }

    return groupedTools;
  });
}

export const createCmd = Command.make(
  'create',
  {
    userIdOpt,
    toolkitsOpt,
    toolsOpt,
    manageConnectionsOpt,
    authConfigsOpt,
    connectedAccountsOpt,
    jsonOpt,
  },
  ({
    userIdOpt,
    toolkitsOpt,
    toolsOpt,
    manageConnectionsOpt,
    authConfigsOpt,
    connectedAccountsOpt,
    jsonOpt,
  }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;

      const userId =
        Option.getOrUndefined(userIdOpt) ?? process.env['COMPOSIO_TEST_USER_ID'] ?? undefined;
      if (!userId) {
        return yield* Effect.fail(
          new Error(
            'Missing session user id. Provide --user_id or set COMPOSIO_TEST_USER_ID in your environment.'
          )
        );
      }

      const toolkits = parseCsvOption(toolkitsOpt);
      const toolSlugs = parseCsvOption(toolsOpt);
      const toolsConfig = yield* buildToolsConfig(toolSlugs);
      const manageConnections = yield* parseBooleanOption(
        'manage_connections',
        manageConnectionsOpt
      );
      const authConfigs = yield* parseToolkitMapOption('auth_configs', authConfigsOpt);
      const connectedAccounts = yield* parseToolkitMapOption(
        'connected_accounts',
        connectedAccountsOpt
      );

      const response = yield* repo.toolRouterSessionCreate({
        user_id: userId,
        toolkits: toolkits.length > 0 ? { enable: [...toolkits] } : undefined,
        tools: toolsConfig,
        manage_connections:
          manageConnections !== undefined ? { enable: manageConnections } : undefined,
        auth_configs: authConfigs,
        connected_accounts: connectedAccounts,
      });

      if (jsonOpt) {
        yield* Console.log(JSON.stringify(response, null, 2));
        return;
      }

      const mcp = asRecord(response['mcp']);
      yield* Console.log('Session created successfully');
      yield* Console.log(`id: ${asString(response['session_id']) ?? '-'}`);
      yield* Console.log(`MCP: ${asString(mcp?.['url']) ?? '-'}`);
      yield* Console.log('');
      yield* Console.log('Use `x-api-key` header with your project API key to use this session');
    })
).pipe(
  Command.withDescription(
    'Create a Tool Router session and print session id + MCP URL for agent/MCP usage.'
  )
);
