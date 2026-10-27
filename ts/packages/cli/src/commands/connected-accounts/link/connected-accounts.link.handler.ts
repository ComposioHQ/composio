import { Effect, Match, Option, Schedule, pipe } from 'effect';
import type { ComposioClientShape } from '@composio/client/effect';
import open from 'open';
import { commandInputError } from 'src/commands/errors';
import {
  actingUser,
  CommandSurface,
  type CommandTree,
  type MissingActingUserError,
} from 'src/commands/surface';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { failedWith } from 'src/effects/request-error';
import { reportFailure } from 'src/effects/report-failure';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { extractApiErrorDetails, extractMessage } from 'src/utils/api-error-extraction';
import { ProjectContext } from 'src/services/project-context';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { getSessionInfoByUserApiKey } from 'src/services/composio-account';
import { linkApolloIdentityForAnalytics } from 'src/analytics/dispatch';
import type { ResolvedCommandProject } from 'src/services/command-project';
import {
  invalidateConsumerConnectedToolkitsCache,
  writeConsumerConnectedToolkitsCache,
} from 'src/services/consumer-short-term-cache';
import { appendCliSessionHistory } from 'src/services/cli-session-artifacts';
import {
  groupCachedConnectedAccountsByToolkit,
  resolveDefaultConnectedAccountsByToolkit,
} from 'src/services/connected-account-selection';
import { decodeConnectedAccountItems } from 'src/effects/decode-connected-account-list';
import { idempotent } from 'src/services/composio-request';
import {
  BrowserOpenError,
  ConnectedAccountsDecodeError,
  ConnectedAccountsRequestError,
  ConnectionPollingError,
  MissingLinkUserIdError,
} from './connected-accounts.link.errors';
import {
  AUTH_CONFIG_SCOPE_MESSAGE,
  BROWSE_AUTH_CONFIGS_HINT,
  BROWSE_TOOLKITS_HINT,
  INCOMPLETE_LINK_RESPONSE_MESSAGE,
  LIST_REQUIRES_TOOLKIT_MESSAGE,
  LIST_WITH_AUTH_CONFIG_MESSAGE,
  ROOT_AUTH_CONFIG_MESSAGE,
  TOOLKIT_AND_AUTH_CONFIG_MESSAGE,
  activeConnectionMessage,
  dashboardConnectUrl,
  formatActiveLinkJson,
  formatConnectedAccountsListJson,
  formatPendingLinkJson,
  missingArgumentMessage,
  showAliasConflict,
  showConnectedAccounts,
  showExistingAccounts,
  showRedirectUrl,
  unmanagedAuthMessage,
  type ExistingAccountLabel,
  type LinkTarget,
} from './connected-accounts.link.format';

/**
 * The flags of `link` on both trees. The `dev` group's `--user-id` and `--project-name` come
 * from `CommandSurface`, not from here.
 */
export type ConnectedAccountsLinkParams = {
  readonly toolkit: Option.Option<string>;
  readonly authConfig: Option.Option<string>;
  readonly noWait: boolean;
  readonly noBrowser: boolean;
  readonly alias: Option.Option<string>;
  readonly list: boolean;
};

/** The three things `link` does; the flags pick one. */
type LinkFlow = 'list' | 'legacy' | 'tool-router';

/** The command path a usage error carries, per tree: `dev connected-accounts link` under `dev`. */
const invalidOptionValueFor = (tree: CommandTree) =>
  commandInputError(tree === 'dev' ? 'dev connected-accounts link' : 'link');

// --- shared steps -----------------------------------------------------------------------------

const projectScope = (project: ResolvedCommandProject) => ({
  orgId: project.orgId,
  projectId: project.projectId,
});

/**
 * The consumer scope of a project, for the caches and session history that are consumer-only:
 * some for a `CONSUMER` project with a consumer user, none for a developer project.
 */
const consumerScope = (project: ResolvedCommandProject) =>
  pipe(
    Option.fromNullishOr(project.consumerUserId),
    Option.filter(() => project.projectType === 'CONSUMER'),
    Option.map(consumerUserId => ({
      orgId: project.orgId,
      projectId: project.projectId,
      consumerUserId,
    }))
  );

/**
 * C2: fail with `MissingActingUserError` itself. This keeps the tag `cli.command.failed`
 * reports as `error_name`, and the one the handler tests match.
 */
const missingLinkUserId = (flow: LinkFlow) => (error: MissingActingUserError) =>
  Effect.fail(new MissingLinkUserIdError({ message: error.message, flow }));

/** The directory's project keys, or none when the directory is not initialized or unreadable. */
const directoryProject = Effect.gen(function* () {
  const projectContext = yield* ProjectContext;
  return yield* projectContext.resolve.pipe(Effect.option, Effect.map(Option.flatten));
});

/** `--alias` trimmed, or a usage error when it is blank. */
const resolveNormalizedAliasOption = (alias: Option.Option<string>, tree: CommandTree) =>
  Effect.transposeOption(
    Option.map(alias, rawAlias =>
      Effect.fromOption(
        Option.liftPredicate(rawAlias.trim(), trimmed => trimmed.length > 0),
        () => invalidOptionValueFor(tree)('`--alias` cannot be empty.', '--alias')
      )
    )
  );

/** The user's active accounts in a toolkit or an auth config, up to one page of 100. */
const listActiveConnectedAccounts = (params: {
  readonly client: ComposioClientShape;
  readonly userId: string;
  readonly toolkitSlug?: string;
  readonly authConfigId?: string;
}) =>
  params.client.connectedAccounts.list(
    {
      user_ids: [params.userId],
      toolkit_slugs: params.toolkitSlug ? [params.toolkitSlug] : undefined,
      auth_config_ids: params.authConfigId ? [params.authConfigId] : undefined,
      statuses: ['ACTIVE'],
      limit: 100,
    },
    idempotent
  );

/**
 * The accounts that power the `--alias` hints. This fetch is auxiliary: a transient list
 * failure must not abort the link flow, so it answers with no accounts.
 */
const existingAccountsForHints = (params: Parameters<typeof listActiveConnectedAccounts>[0]) =>
  listActiveConnectedAccounts(params).pipe(
    Effect.map((response): ReadonlyArray<ExistingAccountLabel> => response.items),
    Effect.catch(() => Effect.succeed<ReadonlyArray<ExistingAccountLabel>>([]))
  );

/**
 * True when no existing account already carries `alias` (compared case-insensitively); false
 * after explaining the conflict and how to use the existing account.
 */
const ensureAliasIsAvailable = (params: {
  readonly ui: TerminalUI;
  readonly alias: Option.Option<string>;
  readonly existingAccounts: ReadonlyArray<ExistingAccountLabel>;
  readonly executeCommand: string;
  readonly listCommand: string;
}) =>
  Option.match(
    Option.flatMap(params.alias, alias =>
      Option.map(
        Option.fromNullishOr(
          params.existingAccounts.find(
            item => item.alias?.trim().toLowerCase() === alias.toLowerCase()
          )
        ),
        existing => ({ alias, existing })
      )
    ),
    {
      onNone: () => Effect.succeed(true),
      onSome: ({ alias, existing }) =>
        showAliasConflict(params.ui, {
          alias,
          existingId: existing.id,
          executeCommand: params.executeCommand,
          listCommand: params.listCommand,
        }).pipe(Effect.as(false)),
    }
  );

/**
 * True when the new link may proceed: an alias was given, no account exists yet in the scope,
 * or the link reuses an existing account. False after listing the accounts that block it.
 */
const ensureAliasForAdditionalAccount = (params: {
  readonly ui: TerminalUI;
  readonly alias: Option.Option<string>;
  readonly connectedAccountId: string;
  readonly existingAccounts: ReadonlyArray<ExistingAccountLabel>;
  readonly scopeDescription: string;
}) => {
  const blocked =
    Option.isNone(params.alias) &&
    params.existingAccounts.length > 0 &&
    !params.existingAccounts.some(item => item.id === params.connectedAccountId);
  return blocked
    ? showExistingAccounts(params.ui, params.scopeDescription, params.existingAccounts).pipe(
        Effect.as(false)
      )
    : Effect.succeed(true);
};

/** A response field that is present and not blank. */
const nonEmpty = (value: string | null | undefined) =>
  Option.filter(Option.fromNullishOr(value), text => text.length > 0);

/** The link the API answered with, or none after reporting an incomplete response (exit 1). */
const validateLinkResponse = (
  ui: TerminalUI,
  linkResponse: {
    readonly connected_account_id?: string | null;
    readonly redirect_url?: string | null;
  }
) =>
  Option.match(
    Option.zipWith(
      nonEmpty(linkResponse.connected_account_id),
      nonEmpty(linkResponse.redirect_url),
      (connectedAccountId, redirectUrl): LinkTarget => ({ connectedAccountId, redirectUrl })
    ),
    {
      onSome: target => Effect.succeedSome(target),
      onNone: () =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Link response:', linkResponse);
          yield* reportFailure(ui, INCOMPLETE_LINK_RESPONSE_MESSAGE);
          return Option.none<LinkTarget>();
        }),
    }
  );

const openBrowser = (url: string) =>
  Effect.tryPromise({
    try: () => open(url, { wait: false }),
    catch: cause => new BrowserOpenError({ message: 'Failed to open the browser.', cause }),
  });

/** Polls the account until it is `ACTIVE`: a 0.3s exponential ramp capped at 5s, 15 attempts. */
const pollUntilActive = (client: ComposioClientShape, connectedAccountId: string) =>
  Effect.retry(
    Effect.gen(function* () {
      const account = yield* client.connectedAccounts
        .retrieve(connectedAccountId, idempotent)
        .pipe(
          failedWith(
            ConnectedAccountsRequestError,
            `Failed to fetch connected account "${connectedAccountId}".`
          )
        );
      if (account.status === 'ACTIVE') {
        return account;
      }
      return yield* new ConnectionPollingError({
        message: `Connection status is still '${account.status}', waiting for 'ACTIVE'`,
        connectedAccountId,
        status: account.status,
      });
    }),
    Schedule.max([Schedule.exponential('0.3 seconds'), Schedule.spaced('5 seconds')]).pipe(
      Schedule.upTo({ times: 15 })
    )
  );

/** Opens the authorization page unless `noBrowser`, then waits for the account to turn `ACTIVE`. */
const waitForActiveConnection = (
  ui: TerminalUI,
  client: ComposioClientShape,
  target: LinkTarget,
  noBrowser: boolean
) =>
  Effect.gen(function* () {
    yield* showRedirectUrl(ui, target.redirectUrl, { manual: noBrowser });

    const urlSchemeValid = Option.exists(
      Option.liftThrowable((value: string) => new URL(value))(target.redirectUrl),
      parsed => parsed.protocol === 'https:' || parsed.protocol === 'http:'
    );
    if (!urlSchemeValid) {
      yield* ui.log.warn(`Redirect URL has an unexpected scheme: ${target.redirectUrl}`);
      yield* ui.log.info('Open the URL manually if you trust the source.');
    } else if (!noBrowser) {
      yield* openBrowser(target.redirectUrl).pipe(
        Effect.catchTag('commands/BrowserOpenError', error =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Failed to open browser:', error);
            yield* ui.log.warn('Could not open the browser automatically.');
            yield* ui.log.info('Open the URL above manually.');
          })
        )
      );
    }

    yield* ui.useMakeSpinner('Waiting for authorization...', spinner =>
      pollUntilActive(client, target.connectedAccountId).pipe(
        Effect.tap(account =>
          Effect.all([
            spinner.stop('Connection successful'),
            ui.log.success(activeConnectionMessage(account)),
            ui.output(formatActiveLinkJson({ account, redirectUrl: target.redirectUrl })),
          ])
        ),
        Effect.tapError(() =>
          spinner.error('Timed out waiting for authorization. Run the command again.')
        )
      )
    );
  });

/** Prints the `--no-wait` payload, or opens the page and waits, after a link was created. */
const finishLink = (params: {
  readonly ui: TerminalUI;
  readonly client: ComposioClientShape;
  readonly target: LinkTarget;
  readonly toolkit: Option.Option<string>;
  readonly projectType: ResolvedCommandProject['projectType'];
  readonly noWait: boolean;
  readonly noBrowser: boolean;
}) =>
  params.noWait
    ? Effect.gen(function* () {
        yield* showRedirectUrl(params.ui, params.target.redirectUrl, { manual: true });
        yield* params.ui.output(
          formatPendingLinkJson({
            target: params.target,
            toolkit: params.toolkit,
            projectType: params.projectType,
          }),
          { force: true }
        );
      })
    : waitForActiveConnection(params.ui, params.client, params.target, params.noBrowser);

/**
 * Composio does not manage auth for the toolkit: send the user to the dashboard page that
 * connects it, naming the org of the active membership when the session info answers.
 */
const handleNoManagedAuth = (ui: TerminalUI, toolkitSlug: string, noBrowser: boolean) =>
  Effect.gen(function* () {
    const userContext = yield* ComposioUserContext;
    const orgName = yield* Option.match(userContext.data.apiKey, {
      onNone: () => Effect.succeed('~'),
      onSome: userApiKey =>
        Effect.gen(function* () {
          const sessionInfo = yield* getSessionInfoByUserApiKey({
            userApiKey,
            orgId: Option.getOrUndefined(userContext.data.orgId),
          }).pipe(Effect.option);
          yield* Effect.transposeOption(
            Option.map(sessionInfo, info =>
              linkApolloIdentityForAnalytics(info.org_member.id, userApiKey)
            )
          );
          return pipe(
            sessionInfo,
            Option.map(info => info.project.org.name),
            Option.filter(name => name.length > 0),
            Option.getOrElse(() => '~')
          );
        }),
    });
    const dashboardUrl = dashboardConnectUrl(userContext.data.webURL, orgName, toolkitSlug);

    yield* ui.log.warn(unmanagedAuthMessage(toolkitSlug, noBrowser));
    yield* noBrowser
      ? Effect.void
      : openBrowser(dashboardUrl).pipe(
          Effect.catchTag('commands/BrowserOpenError', () =>
            ui.log.warn('Could not open the browser automatically.')
          )
        );
    yield* ui.note(dashboardUrl, 'Dashboard URL');
    yield* ui.output(dashboardUrl);
  });

// --- the three flows --------------------------------------------------------------------------

/**
 * `link <toolkit> --list`: the acting user's active accounts in the toolkit, as a table on
 * stderr and JSON on stdout.
 */
export const handleListConnectedAccounts = (params: ConnectedAccountsLinkParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { tree } = yield* CommandSurface;
    if (Option.isNone(params.toolkit)) {
      return yield* Effect.fail(
        invalidOptionValueFor(tree)(LIST_REQUIRES_TOOLKIT_MESSAGE, '--list')
      );
    }
    if (Option.isSome(params.authConfig)) {
      return yield* Effect.fail(
        invalidOptionValueFor(tree)(LIST_WITH_AUTH_CONFIG_MESSAGE, '--list')
      );
    }
    const toolkitSlug = params.toolkit.value;

    const clientSingleton = yield* ComposioClientSingleton;
    const { userId: resolvedUserId, project: resolvedProject } = yield* actingUser().pipe(
      Effect.catchTag('commands/MissingActingUserError', missingLinkUserId('list'))
    );
    const client = yield* clientSingleton.getFor(projectScope(resolvedProject));

    const accounts = yield* ui.withSpinner(
      `Listing connected accounts for "${toolkitSlug}"...`,
      client.connectedAccounts
        .list(
          {
            toolkit_slugs: [toolkitSlug],
            user_ids: [resolvedUserId],
            statuses: ['ACTIVE'],
            limit: 100,
          },
          idempotent
        )
        .pipe(
          failedWith(
            ConnectedAccountsRequestError,
            `Failed to list connected accounts for "${toolkitSlug}".`
          )
        )
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

    yield* Effect.transposeOption(
      Option.map(consumerScope(resolvedProject), scope =>
        writeConsumerConnectedToolkitsCache({
          orgId: scope.orgId,
          consumerUserId: scope.consumerUserId,
          toolkits: [toolkitSlug],
          toolRouterConnectedAccounts: {
            connectedAccounts: resolveDefaultConnectedAccountsByToolkit(connectedAccounts),
            availableConnectedAccounts: groupCachedConnectedAccountsByToolkit(connectedAccounts),
          },
        }).pipe(Effect.ignore)
      )
    );

    yield* showConnectedAccounts(ui, toolkitSlug, connectedAccounts);
    yield* ui.output(formatConnectedAccountsListJson(toolkitSlug, connectedAccounts), {
      force: true,
    });
  });

/**
 * `dev connected-accounts link --auth-config <id>`: the legacy flow against a developer
 * project, without the Tool Router, as the acting user. A missing project is reported before a
 * missing user.
 */
export const handleLegacyAuthConfigLink = (params: ConnectedAccountsLinkParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { tree, projectName } = yield* CommandSurface;
    // The dispatcher never gets here without --auth-config. This narrows it for direct callers.
    if (Option.isNone(params.authConfig)) {
      return yield* Effect.fail(
        invalidOptionValueFor(tree)(missingArgumentMessage(tree), '--auth-config')
      );
    }
    const authConfigId = params.authConfig.value;

    const clientSingleton = yield* ComposioClientSingleton;
    if (Option.isNone(projectName) && Option.isNone(yield* directoryProject)) {
      return yield* Effect.fail(
        invalidOptionValueFor(tree)(AUTH_CONFIG_SCOPE_MESSAGE, '--auth-config')
      );
    }
    const acting = yield* actingUser().pipe(
      Effect.catchTag('commands/MissingActingUserError', missingLinkUserId('legacy'))
    );
    const { userId: resolvedUserId, project: resolvedProject } = acting;

    const client = yield* clientSingleton.getFor(projectScope(resolvedProject));
    const normalizedAlias = yield* resolveNormalizedAliasOption(params.alias, tree);
    const existingAccounts = yield* existingAccountsForHints({
      client,
      userId: resolvedUserId,
      authConfigId,
    });
    const aliasAvailable = yield* ensureAliasIsAvailable({
      ui,
      alias: normalizedAlias,
      existingAccounts,
      executeCommand: 'composio dev playground-execute',
      listCommand: 'composio dev connected-accounts list',
    });
    if (!aliasAvailable) return;

    const linkOpt = yield* ui
      .withSpinner(
        'Creating link session...',
        client.link.create({
          auth_config_id: authConfigId,
          user_id: resolvedUserId,
          ...(Option.isSome(normalizedAlias) && { alias: normalizedAlias.value }),
        })
      )
      .pipe(
        Effect.asSome,
        Effect.catch(error =>
          Effect.gen(function* () {
            yield* reportFailure(
              ui,
              extractMessage(error) || `Failed to create link for auth config "${authConfigId}".`,
              BROWSE_AUTH_CONFIGS_HINT
            );
            return Option.none();
          })
        )
      );
    if (Option.isNone(linkOpt)) return;

    const target = yield* validateLinkResponse(ui, linkOpt.value);
    if (Option.isNone(target)) return;

    const canContinue = yield* ensureAliasForAdditionalAccount({
      ui,
      alias: normalizedAlias,
      connectedAccountId: target.value.connectedAccountId,
      existingAccounts,
      scopeDescription: `user "${resolvedUserId}" in auth config "${authConfigId}"`,
    });
    if (!canContinue) return;

    yield* finishLink({
      ui,
      client,
      target: target.value,
      toolkit: Option.none(),
      projectType: resolvedProject.projectType,
      noWait: params.noWait,
      noBrowser: params.noBrowser,
    });
  });

/**
 * `link <toolkit>`: the Tool Router flow as the acting user, against the consumer project on the
 * root tree and the developer project on the dev tree. Records the link in the session history.
 */
export const handleToolRouterLink = (params: ConnectedAccountsLinkParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { tree } = yield* CommandSurface;
    // The dispatcher never gets here without a toolkit. This narrows it for direct callers.
    if (Option.isNone(params.toolkit)) {
      return yield* Effect.fail(
        invalidOptionValueFor(tree)(missingArgumentMessage(tree), '<toolkit>')
      );
    }
    const toolkitSlug = params.toolkit.value;

    const normalizedAlias = yield* resolveNormalizedAliasOption(params.alias, tree);
    const clientSingleton = yield* ComposioClientSingleton;
    const { userId: resolvedUserId, project: resolvedProject } = yield* actingUser().pipe(
      Effect.catchTag('commands/MissingActingUserError', missingLinkUserId('tool-router'))
    );
    const client = yield* clientSingleton.getFor(projectScope(resolvedProject));
    const existingAccounts = yield* existingAccountsForHints({
      client,
      userId: resolvedUserId,
      toolkitSlug,
    });
    const aliasAvailable = yield* ensureAliasIsAvailable({
      ui,
      alias: normalizedAlias,
      existingAccounts,
      ...(tree === 'dev'
        ? {
            executeCommand: 'composio dev playground-execute',
            listCommand: `composio dev connected-accounts list --toolkits ${toolkitSlug}`,
          }
        : {
            executeCommand: 'composio execute',
            listCommand: `composio connections list --toolkit ${toolkitSlug}`,
          }),
    });
    if (!aliasAvailable) return;

    const scope = consumerScope(resolvedProject);
    const linkOpt = yield* ui
      .withSpinner(
        `Linking ${toolkitSlug}...`,
        Effect.gen(function* () {
          const { sessionId } = yield* resolveToolRouterSession(client, resolvedUserId, {
            manageConnections: true,
            cacheScope: Option.getOrUndefined(scope),
            excludeConnectedAccountsForToolkits: [toolkitSlug],
            multiAccount: Option.isSome(normalizedAlias) ? { enable: true } : undefined,
          });
          return yield* client.toolRouter.session
            .link(sessionId, {
              toolkit: toolkitSlug,
              ...(Option.isSome(normalizedAlias) && { alias: normalizedAlias.value }),
            })
            .pipe(
              failedWith(
                ConnectedAccountsRequestError,
                `Failed to create link for toolkit "${toolkitSlug}".`
              )
            );
        })
      )
      .pipe(
        Effect.asSome,
        Effect.catch(error =>
          Effect.gen(function* () {
            if (extractApiErrorDetails(error)?.slug === 'ToolRouterV2_NoManagedAuth') {
              yield* handleNoManagedAuth(ui, toolkitSlug, params.noBrowser);
              return Option.none();
            }
            yield* Effect.logDebug('Link error:', error);
            yield* reportFailure(
              ui,
              extractMessage(error) ?? `Failed to create link for toolkit "${toolkitSlug}".`,
              BROWSE_TOOLKITS_HINT
            );
            return Option.none();
          })
        ),
        Effect.tap(() => invalidateConsumerConnectedToolkitsCache().pipe(Effect.ignore))
      );
    if (Option.isNone(linkOpt)) return;

    const target = yield* validateLinkResponse(ui, linkOpt.value);
    if (Option.isNone(target)) return;

    const canContinue = yield* ensureAliasForAdditionalAccount({
      ui,
      alias: normalizedAlias,
      connectedAccountId: target.value.connectedAccountId,
      existingAccounts,
      scopeDescription: `user "${resolvedUserId}" in toolkit "${toolkitSlug}"`,
    });
    if (!canContinue) return;

    yield* finishLink({
      ui,
      client,
      target: target.value,
      toolkit: Option.some(toolkitSlug),
      projectType: resolvedProject.projectType,
      noWait: params.noWait,
      noBrowser: params.noBrowser,
    });
    yield* appendCliSessionHistory({
      orgId: Option.getOrUndefined(Option.map(scope, s => s.orgId)),
      consumerUserId: Option.getOrUndefined(Option.map(scope, s => s.consumerUserId)),
      entry: {
        command: 'link',
        status: params.noWait ? 'pending' : 'active',
        toolkit: toolkitSlug,
        connectedAccountId: target.value.connectedAccountId,
        redirectUrl: target.value.redirectUrl,
      },
    }).pipe(Effect.ignore);
  });

// --- dispatch -----------------------------------------------------------------------------------

/**
 * Which flow the flags select. A usage mistake the parser cannot see fails with a
 * `CommandInputError`, so it reaches stderr and exits 1 even when stderr is not a TTY.
 */
const selectLinkFlow = (params: ConnectedAccountsLinkParams, tree: CommandTree) =>
  Effect.gen(function* () {
    yield* resolveNormalizedAliasOption(params.alias, tree);
    const select = (flow: LinkFlow) => Effect.succeed(flow);
    return yield* Match.value({
      tree,
      toolkit: Option.isSome(params.toolkit),
      authConfig: Option.isSome(params.authConfig),
      list: params.list,
    }).pipe(
      Match.when({ tree: 'root', authConfig: true }, () =>
        Effect.fail(invalidOptionValueFor(tree)(ROOT_AUTH_CONFIG_MESSAGE, '--auth-config'))
      ),
      Match.when({ toolkit: true, authConfig: true }, () =>
        Effect.fail(invalidOptionValueFor(tree)(TOOLKIT_AND_AUTH_CONFIG_MESSAGE, '--auth-config'))
      ),
      Match.when({ toolkit: false, authConfig: false }, () =>
        Effect.fail(invalidOptionValueFor(tree)(missingArgumentMessage(tree), '<toolkit>'))
      ),
      Match.when({ list: true }, () => select('list')),
      Match.when({ authConfig: true }, () => select('legacy')),
      Match.orElse(() => select('tool-router'))
    );
  });

/** `link` on either tree: validates the flag combination, then runs the flow it selects. */
export const runConnectedAccountsLink = (params: ConnectedAccountsLinkParams) =>
  Effect.gen(function* () {
    const { tree } = yield* CommandSurface;
    const flow = yield* selectLinkFlow(params, tree);
    yield* Match.value(flow).pipe(
      Match.when('list', () => handleListConnectedAccounts(params)),
      Match.when('legacy', () => handleLegacyAuthConfigLink(params)),
      Match.when('tool-router', () => handleToolRouterLink(params)),
      Match.exhaustive
    );
  });
