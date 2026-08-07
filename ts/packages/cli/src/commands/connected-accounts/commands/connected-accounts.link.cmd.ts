import { Args, Command, HelpDoc, Options, ValidationError } from '@effect/cli';
import { Data, Effect, Option, Schedule } from 'effect';
import type { Composio as RawComposioClient } from '@composio/client';
import open from 'open';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { extractMessage, extractSlug } from 'src/utils/api-error-extraction';
import { ProjectContext } from 'src/services/project-context';
import { ComposioClientSingleton, getSessionInfoByUserApiKey } from 'src/services/composio-clients';
import { linkApolloIdentityForAnalytics } from 'src/analytics/dispatch';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
} from 'src/services/command-project';
import {
  invalidateConsumerConnectedToolkitsCache,
  writeConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { appendCliSessionHistory } from 'src/services/cli-session-artifacts';
import { formatConnectedAccountsTable } from '../format';
import {
  groupCachedConnectedAccountsByToolkit,
  resolveDefaultConnectedAccountsByToolkit,
} from 'src/services/connected-account-selection';
import { decodeConnectedAccountItems } from 'src/effects/decode-connected-account-list';

class ConnectionPollingError extends Data.TaggedError('commands/ConnectionPollingError')<{
  readonly message: string;
  readonly connectedAccountId: string;
  readonly status: string;
}> {}

class MissingLinkUserIdError extends Data.TaggedError('commands/MissingLinkUserIdError')<{
  readonly message: string;
  readonly flow: 'list' | 'legacy' | 'tool-router';
}> {}

class ConnectedAccountsDecodeError extends Data.TaggedError(
  'commands/ConnectedAccountsDecodeError'
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

class ConnectedAccountsRequestError extends Data.TaggedError(
  'commands/ConnectedAccountsRequestError'
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

class BrowserOpenError extends Data.TaggedError('commands/BrowserOpenError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const invalidOptionValue = (message: string) => ValidationError.invalidValue(HelpDoc.p(message));

const toolkit = Args.text({ name: 'toolkit' }).pipe(
  Args.withDescription('Toolkit slug to link (e.g. "github", "gmail")'),
  Args.optional
);

const authConfig = Options.text('auth-config').pipe(
  Options.withDescription('Auth config ID (e.g. "ac_..."). Uses legacy flow (no Tool Router).'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.withDescription('Developer-project user ID override'),
  Options.optional
);

const projectName = Options.text('project-name').pipe(
  Options.optional,
  Options.withDescription('Developer project name override for this command')
);

const noWait = Options.boolean('no-wait').pipe(
  Options.withDefault(false),
  Options.withDescription('Do not wait for authorization; only print link info')
);

const noBrowser = Options.boolean('no-browser').pipe(
  Options.withDefault(false),
  Options.withDescription('Do not open the browser automatically; print the URL to open manually')
);

const alias = Options.text('alias').pipe(
  Options.withDescription(
    'Alias to assign to the connected account. Required when creating an additional account for the same toolkit/auth config.'
  ),
  Options.optional
);

const list = Options.boolean('list').pipe(
  Options.withDefault(false),
  Options.withDescription(
    'List existing connected accounts for the toolkit instead of creating a new link'
  )
);

const showRedirectUrl = (
  ui: TerminalUI,
  redirectUrl: string,
  options?: { readonly emitRaw?: boolean; readonly manual?: boolean }
) =>
  Effect.gen(function* () {
    yield* ui.log.step(
      options?.manual
        ? 'Open this URL in your browser to authorize'
        : 'Redirecting you to the authorization page'
    );
    yield* ui.note(redirectUrl, 'Redirect URL');
    if (options?.emitRaw) {
      yield* ui.output(redirectUrl);
    }
  });

const waitForActiveConnection = (
  ui: TerminalUI,
  client: RawComposioClient,
  connectedAccountId: string,
  redirectUrl: string,
  noBrowser: boolean
) =>
  Effect.gen(function* () {
    yield* showRedirectUrl(ui, redirectUrl, { manual: noBrowser });

    const parsedUrl = Option.liftThrowable((value: string) => new URL(value))(redirectUrl);
    const urlSchemeValid = Option.exists(
      parsedUrl,
      parsed => parsed.protocol === 'https:' || parsed.protocol === 'http:'
    );

    if (!urlSchemeValid) {
      yield* ui.log.warn(`Redirect URL has an unexpected scheme: ${redirectUrl}`);
      yield* ui.log.info('Open the URL manually if you trust the source.');
    } else if (!noBrowser) {
      yield* Effect.tryPromise({
        try: () => open(redirectUrl, { wait: false }),
        catch: cause => new BrowserOpenError({ message: 'Failed to open the browser.', cause }),
      }).pipe(
        Effect.catchTag('commands/BrowserOpenError', error =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Failed to open browser:', error);
            yield* ui.log.warn('Could not open the browser automatically.');
            yield* ui.log.info('Open the URL above manually.');
          })
        )
      );
    }

    yield* ui.useMakeSpinner('Waiting for authentication...', spinner =>
      Effect.retry(
        Effect.gen(function* () {
          const account = yield* Effect.tryPromise({
            try: () => client.connectedAccounts.retrieve(connectedAccountId),
            catch: cause =>
              new ConnectedAccountsRequestError({
                message: `Failed to fetch connected account "${connectedAccountId}".`,
                cause,
              }),
          });
          if (account.status === 'ACTIVE') {
            return account;
          }
          return yield* new ConnectionPollingError({
            message: `Connection status is still '${account.status}', waiting for 'ACTIVE'`,
            connectedAccountId,
            status: account.status,
          });
        }),
        Schedule.exponential('0.3 seconds').pipe(
          Schedule.intersect(Schedule.recurs(15)),
          Schedule.intersect(Schedule.spaced('5 seconds'))
        )
      ).pipe(
        Effect.tap(account => {
          const message = `Connected account "${account.id}" is now ACTIVE (toolkit: ${account.toolkit.slug}).`;
          return Effect.all([
            spinner.stop('Connection successful'),
            ui.log.success(message),
            ui.output(
              JSON.stringify(
                {
                  status: 'success',
                  message,
                  connected_account_id: account.id,
                  toolkit: account.toolkit.slug,
                  redirect_url: redirectUrl,
                },
                null,
                2
              )
            ),
          ]);
        }),
        Effect.tapError(() => spinner.error('Connection timed out. Please try again.'))
      )
    );
  });

const validateLinkResponse = (
  ui: TerminalUI,
  linkResponse: {
    connected_account_id?: string | null;
    redirect_url?: string | null;
  }
) =>
  Effect.gen(function* () {
    const connectedAccountId = linkResponse.connected_account_id;
    const redirectUrl = linkResponse.redirect_url;

    if (!connectedAccountId || !redirectUrl) {
      yield* ui.log.error(
        'The API returned an incomplete link response (missing connected_account_id or redirect_url).'
      );
      yield* Effect.logDebug('Link response:', linkResponse);
      return Option.none();
    }

    return Option.some({
      connectedAccountId,
      redirectUrl,
    });
  });

const handleNoManagedAuth = (ui: TerminalUI, toolkitSlug: string, noBrowser: boolean) =>
  Effect.gen(function* () {
    const userContext = yield* ComposioUserContext;
    const webURL = userContext.data.webURL.replace(/\/+$/, '');
    const apiKey = Option.getOrUndefined(userContext.data.apiKey);

    let orgName = '~';
    if (apiKey) {
      const sessionInfo = yield* getSessionInfoByUserApiKey({
        baseURL: userContext.data.baseURL,
        userApiKey: apiKey,
        orgId: Option.getOrUndefined(userContext.data.orgId),
      }).pipe(Effect.catchAll(() => Effect.succeed(null)));

      if (sessionInfo) {
        yield* linkApolloIdentityForAnalytics(sessionInfo.org_member.id, apiKey);
      }

      if (sessionInfo?.project.org.name) {
        orgName = sessionInfo.project.org.name;
      }
    }

    // Encode path segments so special characters in org names (spaces, @, etc.)
    // don't corrupt the URL structure — without this, `?open=true` can get
    // baked into the path as `%3Fopen%3Dtrue`, causing 404s on the dashboard.
    const dashboardUrl = `${webURL}/${encodeURIComponent(orgName)}/~/connect/apps/${encodeURIComponent(toolkitSlug)}?open=true`;

    yield* ui.log.warn(
      `Composio does not manage auth for "${toolkitSlug}" — ${noBrowser ? 'open the dashboard' : 'opening the dashboard'} to connect manually.`
    );

    if (!noBrowser) {
      yield* Effect.tryPromise({
        try: () => open(dashboardUrl, { wait: false }),
        catch: cause => new BrowserOpenError({ message: 'Failed to open the browser.', cause }),
      }).pipe(
        Effect.catchTag('commands/BrowserOpenError', () =>
          ui.log.warn('Could not open the browser automatically.')
        )
      );
    }

    yield* ui.note(dashboardUrl, 'Dashboard URL');
    yield* ui.output(dashboardUrl);
  });

const getConsumerCacheScope = (resolvedProject: {
  readonly orgId: string;
  readonly projectId: string;
  readonly projectType: 'CONSUMER' | 'DEVELOPER';
  readonly consumerUserId?: string;
}) =>
  resolvedProject.projectType === 'CONSUMER' && resolvedProject.consumerUserId
    ? {
        orgId: resolvedProject.orgId,
        projectId: resolvedProject.projectId,
        consumerUserId: resolvedProject.consumerUserId,
      }
    : undefined;

const normalizeAlias = (rawAlias: string) => rawAlias.trim();

const resolveNormalizedAliasOption = (alias: Option.Option<string>) =>
  Effect.gen(function* () {
    if (Option.isNone(alias)) {
      return Option.none<string>();
    }

    const normalizedAlias = normalizeAlias(alias.value);
    if (normalizedAlias.length === 0) {
      return yield* Effect.fail(invalidOptionValue('`--alias` cannot be empty.'));
    }

    return Option.some(normalizedAlias);
  });

const listActiveConnectedAccounts = (params: {
  readonly client: RawComposioClient;
  readonly userId: string;
  readonly toolkitSlug?: string;
  readonly authConfigId?: string;
}) =>
  Effect.tryPromise({
    try: () =>
      params.client.connectedAccounts.list({
        user_ids: [params.userId],
        toolkit_slugs: params.toolkitSlug ? [params.toolkitSlug] : undefined,
        auth_config_ids: params.authConfigId ? [params.authConfigId] : undefined,
        statuses: ['ACTIVE'],
        limit: 100,
      }),
    catch: cause =>
      new ConnectedAccountsRequestError({
        message: `Failed to list connected accounts for user "${params.userId}".`,
        cause,
      }),
  });

const formatExistingAccountLabels = (
  items: ReadonlyArray<{
    readonly id: string;
    readonly alias?: string | null;
    readonly word_id?: string | null;
  }>
) =>
  items
    .map(item => {
      const labels = [item.alias, item.word_id].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      );
      return labels.length > 0 ? `${item.id} (${labels.join(', ')})` : item.id;
    })
    .join(', ');

const showAliasConflictGuidance = (params: {
  readonly ui: TerminalUI;
  readonly alias: string;
  readonly executeCommand: string;
  readonly listCommand: string;
}) =>
  params.ui.note(
    [
      `Use the existing alias: ${params.executeCommand} <TOOL_SLUG> --account ${params.alias} -d '{ ... }'`,
      `List connected accounts: ${params.listCommand}`,
    ].join('\n'),
    'Tips'
  );

const ensureAliasIsAvailable = (params: {
  readonly ui: TerminalUI;
  readonly alias: Option.Option<string>;
  readonly existingAccounts: ReadonlyArray<{
    readonly id: string;
    readonly alias?: string | null;
  }>;
  readonly executeCommand: string;
  readonly listCommand: string;
}) =>
  Effect.gen(function* () {
    if (Option.isNone(params.alias)) return true as const;

    const normalizedAlias = params.alias.value.toLowerCase();
    const existing = params.existingAccounts.find(
      item => item.alias?.trim().toLowerCase() === normalizedAlias
    );
    if (!existing) return true as const;

    yield* params.ui.log.error(
      `Alias "${params.alias.value}" is already in use by connected account "${existing.id}".`
    );
    yield* showAliasConflictGuidance({
      ui: params.ui,
      alias: params.alias.value,
      executeCommand: params.executeCommand,
      listCommand: params.listCommand,
    });
    return false as const;
  });

const ensureAliasForAdditionalAccount = (params: {
  readonly ui: TerminalUI;
  readonly alias: Option.Option<string>;
  readonly connectedAccountId: string;
  readonly existingAccounts: {
    readonly items: ReadonlyArray<{
      readonly id: string;
      readonly alias?: string | null;
      readonly word_id?: string | null;
    }>;
  };
  readonly scopeDescription: string;
}) =>
  Effect.gen(function* () {
    if (Option.isSome(params.alias)) {
      return true;
    }

    const existingIds = new Set(params.existingAccounts.items.map(item => item.id));
    if (params.existingAccounts.items.length === 0 || existingIds.has(params.connectedAccountId)) {
      return true;
    }

    yield* params.ui.log.error(
      `A connected account already exists for ${params.scopeDescription}. Pass --alias to create another one.`
    );
    yield* params.ui.note(
      formatExistingAccountLabels(params.existingAccounts.items),
      'Existing accounts'
    );
    return false;
  });

const resolveLinkUserId = (params: {
  readonly resolvedProject: {
    readonly projectType: 'CONSUMER' | 'DEVELOPER';
    readonly consumerUserId?: string;
  };
  readonly requestedUserId: Option.Option<string>;
  readonly projectContext: {
    readonly resolve: Effect.Effect<
      Option.Option<{ readonly testUserId: Option.Option<string> }>,
      unknown
    >;
  };
  readonly userContext: {
    readonly data: {
      readonly testUserId: Option.Option<string>;
    };
  };
}) =>
  Effect.gen(function* () {
    const resolvedProjectContext = yield* params.projectContext.resolve.pipe(
      Effect.option,
      Effect.map(Option.flatten)
    );
    const localTestUserId = Option.flatMap(resolvedProjectContext, keys => keys.testUserId);

    const resolvedUserId =
      params.resolvedProject.projectType === 'CONSUMER'
        ? Option.fromNullable(params.resolvedProject.consumerUserId)
        : Option.match(params.requestedUserId, {
            onSome: value => Option.some(value),
            onNone: () => Option.orElse(localTestUserId, () => params.userContext.data.testUserId),
          });

    return {
      resolvedUserId,
      resolvedProjectContext,
      localTestUserId,
    };
  });

const handleListConnectedAccounts = (params: {
  readonly toolkit: Option.Option<string>;
  readonly authConfig: Option.Option<string>;
  readonly rootOnly: boolean;
  readonly projectName: Option.Option<string>;
  readonly userId: Option.Option<string>;
  readonly ui: TerminalUI;
  readonly clientSingleton: {
    readonly getFor: (params: {
      readonly orgId: string;
      readonly projectId: string;
    }) => Effect.Effect<RawComposioClient, unknown>;
  };
  readonly projectContext: {
    readonly resolve: Effect.Effect<
      Option.Option<{ readonly testUserId: Option.Option<string> }>,
      unknown
    >;
  };
  readonly userContext: {
    readonly data: {
      readonly testUserId: Option.Option<string>;
    };
  };
}) =>
  Effect.gen(function* () {
    if (Option.isNone(params.toolkit)) {
      yield* params.ui.log.error(
        '`--list` requires a toolkit slug, e.g. `composio link gmail --list`.'
      );
      return;
    }
    if (Option.isSome(params.authConfig)) {
      yield* params.ui.log.error('`--list` cannot be combined with `--auth-config`.');
      return;
    }

    const toolkitSlug = params.toolkit.value;
    const resolvedProject = yield* resolveCommandProject({
      mode: 'consumer',
      projectName: params.rootOnly ? undefined : Option.getOrUndefined(params.projectName),
    }).pipe(Effect.mapError(formatResolveCommandProjectError));
    const client = yield* params.clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });
    const { resolvedUserId } = yield* resolveLinkUserId({
      resolvedProject,
      requestedUserId: params.userId,
      projectContext: params.projectContext,
      userContext: params.userContext,
    });

    if (Option.isNone(resolvedUserId)) {
      return yield* new MissingLinkUserIdError({
        message: 'Missing user id. Provide --user-id or run composio dev init/login first.',
        flow: 'list',
      });
    }

    const accounts = yield* params.ui.withSpinner(
      `Listing connected accounts for "${toolkitSlug}"...`,
      Effect.tryPromise({
        try: () =>
          client.connectedAccounts.list({
            toolkit_slugs: [toolkitSlug],
            user_ids: [resolvedUserId.value],
            statuses: ['ACTIVE'],
            limit: 100,
          }),
        catch: cause =>
          new ConnectedAccountsRequestError({
            message: `Failed to list connected accounts for "${toolkitSlug}".`,
            cause,
          }),
      })
    );
    const connectedAccounts = yield* decodeConnectedAccountItems(accounts.items).pipe(
      Effect.mapError(
        cause =>
          new ConnectedAccountsDecodeError({
            message: 'The API returned invalid connected account data.',
            cause,
          })
      )
    );

    if (resolvedProject.projectType === 'CONSUMER' && resolvedProject.consumerUserId) {
      yield* writeConsumerConnectedToolkitsCache({
        orgId: resolvedProject.orgId,
        consumerUserId: resolvedProject.consumerUserId,
        toolkits: [toolkitSlug],
        toolRouterConnectedAccounts: {
          connectedAccounts: resolveDefaultConnectedAccountsByToolkit(connectedAccounts),
          availableConnectedAccounts: groupCachedConnectedAccountsByToolkit(connectedAccounts),
        },
      }).pipe(Effect.ignore);
    }

    if (connectedAccounts.length === 0) {
      yield* params.ui.log.warn(`No active connected accounts found for "${toolkitSlug}".`);
      yield* params.ui.output(
        JSON.stringify({ toolkit: toolkitSlug, items: [], total: 0 }, null, 2),
        { force: true }
      );
      return;
    }

    yield* params.ui.note(
      formatConnectedAccountsTable(connectedAccounts),
      `${toolkitSlug}: connected accounts`
    );
    yield* params.ui.output(
      JSON.stringify(
        {
          toolkit: toolkitSlug,
          total: connectedAccounts.length,
          items: connectedAccounts,
        },
        null,
        2
      ),
      { force: true }
    );
  });

const handleLegacyAuthConfigLink = (params: {
  readonly authConfigId: string;
  readonly requestedUserId: Option.Option<string>;
  readonly projectName: Option.Option<string>;
  readonly noWait: boolean;
  readonly noBrowser: boolean;
  readonly alias: Option.Option<string>;
  readonly ui: TerminalUI;
  readonly clientSingleton: {
    readonly getFor: (params: {
      readonly orgId: string;
      readonly projectId: string;
    }) => Effect.Effect<RawComposioClient, unknown>;
  };
  readonly projectContext: {
    readonly resolve: Effect.Effect<
      Option.Option<{ readonly testUserId: Option.Option<string> }>,
      unknown
    >;
  };
  readonly userContext: {
    readonly data: {
      readonly testUserId: Option.Option<string>;
    };
  };
}) =>
  Effect.gen(function* () {
    const resolvedProjectContext = yield* params.projectContext.resolve.pipe(
      Effect.option,
      Effect.map(Option.flatten)
    );
    const localTestUserId = Option.flatMap(resolvedProjectContext, keys => keys.testUserId);
    const globalTestUserId = params.userContext.data.testUserId;
    const resolvedUserId = Option.match(params.requestedUserId, {
      onSome: value => Option.some(value),
      onNone: () => Option.orElse(localTestUserId, () => globalTestUserId),
    });

    if (Option.isNone(resolvedUserId)) {
      return yield* new MissingLinkUserIdError({
        message: 'Missing user id. Provide --user-id or run composio dev init to set test_user_id.',
        flow: 'legacy',
      });
    }
    if (Option.isNone(params.projectName) && Option.isNone(resolvedProjectContext)) {
      yield* params.ui.log.error(
        '`--auth-config` is developer-project scoped. Pass `--project-name <name>` or run from a directory initialized with `composio dev init`.'
      );
      return;
    }
    if (Option.isNone(params.requestedUserId) && Option.isSome(localTestUserId)) {
      yield* params.ui.log.warn(`Using test user id "${localTestUserId.value}"`);
    } else if (Option.isNone(params.requestedUserId) && Option.isSome(globalTestUserId)) {
      yield* params.ui.log.warn(`Using global test user id "${globalTestUserId.value}"`);
    }

    const resolvedProject = yield* resolveCommandProject({
      mode: 'developer',
      projectName: Option.getOrUndefined(params.projectName),
    }).pipe(Effect.mapError(formatResolveCommandProjectError));
    const client = yield* params.clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });
    const normalizedAlias = yield* resolveNormalizedAliasOption(params.alias);
    const existingAccounts = yield* listActiveConnectedAccounts({
      client,
      userId: resolvedUserId.value,
      authConfigId: params.authConfigId,
    }).pipe(
      // Auxiliary fetch powering the --alias hint only: a transient list
      // failure must not abort the link flow.
      Effect.catchAll(() => Effect.succeed({ items: [] }))
    );
    const aliasAvailable = yield* ensureAliasIsAvailable({
      ui: params.ui,
      alias: normalizedAlias,
      existingAccounts: existingAccounts.items,
      executeCommand: 'composio dev playground-execute',
      listCommand: 'composio dev connected-accounts list',
    });
    if (!aliasAvailable) return;

    const linkOpt = yield* params.ui
      .withSpinner(
        'Creating link session...',
        Effect.tryPromise({
          try: () =>
            client.link.create({
              auth_config_id: params.authConfigId,
              user_id: resolvedUserId.value,
              ...(Option.isSome(normalizedAlias) && { alias: normalizedAlias.value }),
            }),
          catch: cause =>
            new ConnectedAccountsRequestError({
              message: `Failed to create link for auth config "${params.authConfigId}".`,
              cause,
            }),
        })
      )
      .pipe(
        Effect.asSome,
        Effect.catchAll(error =>
          Effect.gen(function* () {
            const message =
              extractMessage(error) ??
              `Failed to create link for auth config "${params.authConfigId}".`;
            yield* params.ui.log.error(message);
            yield* params.ui.log.step(
              'Browse available auth configs:\n> composio dev auth-configs list'
            );
            return Option.none();
          })
        )
      );

    if (Option.isNone(linkOpt)) return;

    const validatedLink = yield* validateLinkResponse(params.ui, linkOpt.value);
    if (Option.isNone(validatedLink)) return;

    const { connectedAccountId, redirectUrl } = validatedLink.value;
    const canContinue = yield* ensureAliasForAdditionalAccount({
      ui: params.ui,
      alias: normalizedAlias,
      connectedAccountId,
      existingAccounts,
      scopeDescription: `user "${resolvedUserId.value}" in auth config "${params.authConfigId}"`,
    });
    if (!canContinue) return;

    if (params.noWait) {
      yield* showRedirectUrl(params.ui, redirectUrl, { manual: true });
      yield* params.ui.output(
        JSON.stringify(
          {
            status: 'pending',
            message: 'Complete authorization by opening the URL',
            connected_account_id: connectedAccountId,
            redirect_url: redirectUrl,
            project_type: resolvedProject.projectType,
          },
          null,
          2
        ),
        { force: true }
      );
      return;
    }

    yield* waitForActiveConnection(
      params.ui,
      client,
      connectedAccountId,
      redirectUrl,
      params.noBrowser
    );
  });

const runConnectedAccountsLink = (params: {
  toolkit: Option.Option<string>;
  authConfig: Option.Option<string>;
  userId: Option.Option<string>;
  projectName: Option.Option<string>;
  noWait: boolean;
  noBrowser: boolean;
  alias: Option.Option<string>;
  list: boolean;
  rootOnly: boolean;
}) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const normalizedAliasOption = yield* resolveNormalizedAliasOption(params.alias);

    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;
    const projectContext = yield* ProjectContext;
    const userContext = yield* ComposioUserContext;

    if (params.rootOnly) {
      if (Option.isSome(params.authConfig)) {
        return yield* Effect.fail(
          invalidOptionValue(
            'Top-level `composio link` is consumer-only and does not accept `--auth-config`. Use `composio dev connected-accounts link --auth-config ...` for developer-scoped usage.'
          )
        );
      }
    }

    if (Option.isSome(params.toolkit) && Option.isSome(params.authConfig)) {
      yield* ui.log.error(
        'Cannot use both <toolkit> and --auth-config. Choose one:\n' +
          '  Tool Router: composio dev connected-accounts link <toolkit>\n' +
          '  Legacy:      composio dev connected-accounts link --auth-config <id>'
      );
      return;
    }

    if (Option.isNone(params.toolkit) && Option.isNone(params.authConfig)) {
      yield* ui.log.error(
        params.rootOnly
          ? 'Missing argument. Provide a toolkit slug:\n  composio link github'
          : 'Missing argument. Provide a toolkit slug or --auth-config:\n' +
              '  composio dev connected-accounts link github\n' +
              '  composio dev connected-accounts link --auth-config "ac_..."'
      );
      return;
    }

    if (params.list) {
      yield* handleListConnectedAccounts({
        toolkit: params.toolkit,
        authConfig: params.authConfig,
        rootOnly: params.rootOnly,
        projectName: params.projectName,
        userId: params.userId,
        ui,
        clientSingleton,
        projectContext,
        userContext,
      });
      return;
    }

    if (Option.isSome(params.authConfig)) {
      yield* handleLegacyAuthConfigLink({
        authConfigId: params.authConfig.value,
        requestedUserId: params.userId,
        projectName: params.projectName,
        noWait: params.noWait,
        noBrowser: params.noBrowser,
        alias: params.alias,
        ui,
        clientSingleton,
        projectContext,
        userContext,
      });
      return;
    }

    if (Option.isNone(params.toolkit)) return;
    const toolkitSlug = params.toolkit.value;
    const resolvedProject = yield* resolveCommandProject({
      mode: 'consumer',
      projectName: params.rootOnly ? undefined : Option.getOrUndefined(params.projectName),
    }).pipe(Effect.mapError(formatResolveCommandProjectError));
    const resolvedUserId =
      resolvedProject.projectType === 'CONSUMER'
        ? Option.fromNullable(resolvedProject.consumerUserId)
        : Option.match(params.userId, {
            onSome: value => Option.some(value),
            onNone: () => userContext.data.testUserId,
          });
    if (Option.isNone(resolvedUserId)) {
      return yield* new MissingLinkUserIdError({
        message:
          'Missing user id. Provide --user-id or run composio login to set global test_user_id.',
        flow: 'tool-router',
      });
    }
    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });
    const existingAccounts = yield* listActiveConnectedAccounts({
      client,
      userId: resolvedUserId.value,
      toolkitSlug,
    }).pipe(
      // Auxiliary fetch powering the --alias hint only: a transient list
      // failure must not abort the link flow.
      Effect.catchAll(() => Effect.succeed({ items: [] }))
    );
    const aliasAvailable = yield* ensureAliasIsAvailable({
      ui,
      alias: normalizedAliasOption,
      existingAccounts: existingAccounts.items,
      executeCommand: 'composio execute',
      listCommand: `composio connections list --toolkit ${toolkitSlug}`,
    });
    if (!aliasAvailable) return;

    const linkOpt = yield* ui
      .withSpinner(
        `Linking ${toolkitSlug}...`,
        Effect.gen(function* () {
          const { sessionId } = yield* resolveToolRouterSession(client, resolvedUserId.value, {
            manageConnections: true,
            cacheScope: getConsumerCacheScope(resolvedProject),
            excludeConnectedAccountsForToolkits: [toolkitSlug],
            multiAccount: Option.isSome(normalizedAliasOption)
              ? {
                  enable: true,
                }
              : undefined,
          });
          return yield* Effect.tryPromise({
            try: () =>
              client.toolRouter.session.link(sessionId, {
                toolkit: toolkitSlug,
                ...(Option.isSome(normalizedAliasOption) && {
                  alias: normalizedAliasOption.value,
                }),
              }),
            catch: cause =>
              new ConnectedAccountsRequestError({
                message: `Failed to create link for toolkit "${toolkitSlug}".`,
                cause,
              }),
          });
        })
      )
      .pipe(
        Effect.asSome,
        Effect.catchAll(error =>
          Effect.gen(function* () {
            const slug = extractSlug(error);

            if (slug === 'ToolRouterV2_NoManagedAuth') {
              yield* handleNoManagedAuth(ui, toolkitSlug, params.noBrowser);
              return Option.none();
            }

            const message =
              extractMessage(error) ?? `Failed to create link for toolkit "${toolkitSlug}".`;
            yield* ui.log.error(message);
            yield* Effect.logDebug('Link error:', error);
            yield* ui.log.step('Browse available toolkits:\n> composio dev toolkits list');
            return Option.none();
          })
        ),
        Effect.tap(() => invalidateConsumerConnectedToolkitsCache().pipe(Effect.ignore))
      );

    if (Option.isNone(linkOpt)) return;

    const validatedLink = yield* validateLinkResponse(ui, linkOpt.value);
    if (Option.isNone(validatedLink)) return;

    const { connectedAccountId: connAccountId, redirectUrl } = validatedLink.value;
    const canContinue = yield* ensureAliasForAdditionalAccount({
      ui,
      alias: normalizedAliasOption,
      connectedAccountId: connAccountId,
      existingAccounts,
      scopeDescription: `user "${resolvedUserId.value}" in toolkit "${toolkitSlug}"`,
    });
    if (!canContinue) return;

    if (params.noWait) {
      yield* showRedirectUrl(ui, redirectUrl, { manual: true });
      yield* ui.output(
        JSON.stringify(
          {
            status: 'pending',
            message: 'Complete authorization by opening the URL',
            connected_account_id: connAccountId,
            redirect_url: redirectUrl,
            toolkit: toolkitSlug,
            project_type: resolvedProject.projectType,
          },
          null,
          2
        ),
        { force: true }
      );
      yield* appendCliSessionHistory({
        orgId: resolvedProject.projectType === 'CONSUMER' ? resolvedProject.orgId : undefined,
        consumerUserId:
          resolvedProject.projectType === 'CONSUMER' ? resolvedProject.consumerUserId : undefined,
        entry: {
          command: 'link',
          status: 'pending',
          toolkit: toolkitSlug,
          connectedAccountId: connAccountId,
          redirectUrl,
        },
      }).pipe(Effect.ignore);
    } else {
      yield* waitForActiveConnection(ui, client, connAccountId, redirectUrl, params.noBrowser);
      yield* appendCliSessionHistory({
        orgId: resolvedProject.projectType === 'CONSUMER' ? resolvedProject.orgId : undefined,
        consumerUserId:
          resolvedProject.projectType === 'CONSUMER' ? resolvedProject.consumerUserId : undefined,
        entry: {
          command: 'link',
          status: 'active',
          toolkit: toolkitSlug,
          connectedAccountId: connAccountId,
          redirectUrl,
        },
      }).pipe(Effect.ignore);
    }
  });

export const connectedAccountsCmd$Link = Command.make(
  'link',
  { toolkit, authConfig, userId, projectName, noWait, noBrowser, alias, list },
  ({ toolkit, authConfig, userId, projectName, noWait, noBrowser, alias, list }) =>
    runConnectedAccountsLink({
      toolkit,
      authConfig,
      userId,
      projectName,
      noWait,
      noBrowser,
      alias,
      list,
      rootOnly: false,
    })
).pipe(
  Command.withDescription(
    [
      'Connect an external account (GitHub, Gmail, Slack, etc.) so tools can act on your behalf.',
      'Opens a browser for OAuth authorization and waits for confirmation.',
      '',
      'Examples:',
      '  composio link github',
      '  composio link gmail --alias work',
      '  composio link github --list',
      '',
      'See also:',
      '  composio search "<query>"                 Find tools to use after linking',
      "  composio execute <slug> -d '{ ... }'      Execute a tool with your connected account",
    ].join('\n')
  )
);

export const rootConnectedAccountsCmd$Link = Command.make(
  'link',
  { toolkit, noWait, noBrowser, alias, list },
  ({ toolkit, noWait, noBrowser, alias, list }) =>
    runConnectedAccountsLink({
      toolkit,
      authConfig: Option.none(),
      userId: Option.none(),
      projectName: Option.none(),
      noWait,
      noBrowser,
      alias,
      list,
      rootOnly: true,
    })
).pipe(
  Command.withDescription(
    [
      'Connect an external account (GitHub, Gmail, Slack, etc.) so tools can act on your behalf.',
      'Opens a browser for OAuth authorization and waits for confirmation.',
      '',
      'Examples:',
      '  composio link github',
      '  composio link gmail --alias work',
      '  composio link github --list',
      '',
      'See also:',
      '  composio search "<query>"                 Find tools to use after linking',
      "  composio execute <slug> -d '{ ... }'      Execute a tool with your connected account",
    ].join('\n')
  )
);
