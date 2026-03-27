import { Args, Command, Options } from '@effect/cli';
import { Effect, Option, Schedule } from 'effect';
import type { Composio as RawComposioClient } from '@composio/client';
import open from 'open';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { extractMessage, extractSlug } from 'src/utils/api-error-extraction';
import { ProjectContext } from 'src/services/project-context';
import { ComposioClientSingleton, getSessionInfoByUserApiKey } from 'src/services/composio-clients';
import {
  resolveCommandProject,
  formatResolveCommandProjectError,
} from 'src/services/command-project';
import { invalidateConsumerConnectedToolkitsCache } from 'src/services/consumer-short-term-cache';
import { appendCliSessionHistory } from 'src/services/cli-session-artifacts';

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

const noBrowser = Options.boolean('no-browser').pipe(
  Options.withDefault(false),
  Options.withDescription('Skip auto-opening the browser')
);

const noWait = Options.boolean('no-wait').pipe(
  Options.withDefault(false),
  Options.withDescription('Do not wait for authorization; only print link info')
);

const showRedirectUrl = (
  ui: TerminalUI,
  redirectUrl: string,
  noBrowser: boolean,
  options?: { readonly emitRaw?: boolean }
) =>
  Effect.gen(function* () {
    if (noBrowser) {
      yield* ui.log.info('Please authorize using the following URL:');
    } else {
      yield* ui.log.step('Redirecting you to the authorization page');
    }

    yield* ui.note(redirectUrl, 'Redirect URL');
    if (options?.emitRaw) {
      yield* ui.output(redirectUrl, noBrowser ? { force: true } : undefined);
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
    yield* showRedirectUrl(ui, redirectUrl, noBrowser, { emitRaw: noBrowser });

    if (!noBrowser) {
      let urlSchemeValid = false;
      try {
        const parsed = new URL(redirectUrl);
        urlSchemeValid = parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        // ignore
      }

      if (!urlSchemeValid) {
        yield* ui.log.warn(`Redirect URL has an unexpected scheme: ${redirectUrl}`);
        yield* ui.log.info('Open the URL manually if you trust the source.');
      } else {
        yield* Effect.tryPromise(() => open(redirectUrl, { wait: false })).pipe(
          Effect.catchAll(error =>
            Effect.gen(function* () {
              yield* Effect.logDebug('Failed to open browser:', error);
              yield* ui.log.warn('Could not open the browser automatically.');
              yield* ui.log.info('Tip: try using `--no-browser` and open the URL manually.');
            })
          )
        );
      }
    }

    yield* ui.useMakeSpinner('Waiting for authentication...', spinner =>
      Effect.retry(
        Effect.gen(function* () {
          const account = yield* Effect.tryPromise(() =>
            client.connectedAccounts.retrieve(connectedAccountId)
          );
          if (account.status === 'ACTIVE') {
            return account;
          }
          return yield* Effect.fail(
            new Error(`Connection status is still '${account.status}', waiting for 'ACTIVE'`)
          );
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

    let orgSlug = '~';
    if (apiKey) {
      const sessionInfo = yield* getSessionInfoByUserApiKey({
        baseURL: userContext.data.baseURL,
        userApiKey: apiKey,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)));

      if (sessionInfo?.project.org.name) {
        orgSlug = sessionInfo.project.org.name;
      }
    }

    const dashboardUrl = `${webURL}/${orgSlug}/~/connect/apps/${toolkitSlug}?open=true`;

    yield* ui.log.warn(
      `Composio does not manage auth for "${toolkitSlug}" — opening the dashboard to connect manually.`
    );

    if (!noBrowser) {
      yield* Effect.tryPromise(() => open(dashboardUrl, { wait: false })).pipe(
        Effect.catchAll(() => ui.log.warn('Could not open the browser automatically.'))
      );
    }

    yield* ui.note(dashboardUrl, 'Dashboard URL');
    yield* ui.output(dashboardUrl, noBrowser ? { force: true } : undefined);
  });

const runConnectedAccountsLink = (params: {
  toolkit: Option.Option<string>;
  authConfig: Option.Option<string>;
  userId: Option.Option<string>;
  projectName: Option.Option<string>;
  noBrowser: boolean;
  noWait: boolean;
  rootOnly: boolean;
}) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;
    const projectContext = yield* ProjectContext;
    const userContext = yield* ComposioUserContext;

    if (params.rootOnly) {
      if (Option.isSome(params.authConfig)) {
        return yield* Effect.fail(
          new Error(
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

    if (Option.isSome(params.authConfig)) {
      const authConfigId = params.authConfig.value;
      const resolvedProjectContext = yield* projectContext.resolve.pipe(
        Effect.catchAll(() => Effect.succeed(Option.none()))
      );
      const localTestUserId = Option.flatMap(resolvedProjectContext, keys => keys.testUserId);
      const globalTestUserId = userContext.data.testUserId;
      const resolvedUserId = Option.match(params.userId, {
        onSome: value => Option.some(value),
        onNone: () => Option.orElse(localTestUserId, () => globalTestUserId),
      });
      if (Option.isNone(resolvedUserId)) {
        return yield* Effect.fail(
          new Error(
            'Missing user id. Provide --user-id or run composio dev init to set test_user_id.'
          )
        );
      }
      if (Option.isNone(params.projectName) && Option.isNone(resolvedProjectContext)) {
        yield* ui.log.error(
          '`--auth-config` is developer-project scoped. Pass `--project-name <name>` or run from a directory initialized with `composio dev init`.'
        );
        return;
      }
      if (Option.isNone(params.userId) && Option.isSome(localTestUserId)) {
        yield* ui.log.warn(`Using test user id "${localTestUserId.value}"`);
      } else if (Option.isNone(params.userId) && Option.isSome(globalTestUserId)) {
        yield* ui.log.warn(`Using global test user id "${globalTestUserId.value}"`);
      }
      const resolvedProject = yield* resolveCommandProject({
        mode: 'developer',
        projectName: Option.getOrUndefined(params.projectName),
      }).pipe(Effect.mapError(formatResolveCommandProjectError));
      const client = yield* clientSingleton.getFor({
        orgId: resolvedProject.orgId,
        projectId: resolvedProject.projectId,
      });
      const linkOpt = yield* ui
        .withSpinner(
          'Creating link session...',
          Effect.tryPromise(() =>
            client.link.create({
              auth_config_id: authConfigId,
              user_id: resolvedUserId.value,
            })
          )
        )
        .pipe(
          Effect.asSome,
          Effect.catchAll(error =>
            Effect.gen(function* () {
              const message =
                extractMessage(error) ?? `Failed to create link for auth config "${authConfigId}".`;
              yield* ui.log.error(message);
              yield* ui.log.step(
                'Browse available auth configs:\n> composio dev auth-configs list'
              );
              return Option.none();
            })
          )
        );

      if (Option.isNone(linkOpt)) return;

      const validatedLink = yield* validateLinkResponse(ui, linkOpt.value);
      if (Option.isNone(validatedLink)) return;

      const { connectedAccountId: connId, redirectUrl } = validatedLink.value;
      if (params.noWait) {
        yield* showRedirectUrl(ui, redirectUrl, params.noBrowser);
        yield* ui.output(
          JSON.stringify(
            {
              status: 'pending',
              message: 'Complete authorization by opening the URL',
              connected_account_id: connId,
              redirect_url: redirectUrl,
              project_type: resolvedProject.projectType,
            },
            null,
            2
          ),
          { force: true }
        );
      } else {
        yield* waitForActiveConnection(ui, client, connId, redirectUrl, params.noBrowser);
      }
      return;
    }

    const toolkitSlug = Option.getOrThrow(params.toolkit);
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
      return yield* Effect.fail(
        new Error(
          'Missing user id. Provide --user-id or run composio login to set global test_user_id.'
        )
      );
    }
    const client = yield* clientSingleton.getFor({
      orgId: resolvedProject.orgId,
      projectId: resolvedProject.projectId,
    });

    const linkOpt = yield* ui
      .withSpinner(
        `Linking ${toolkitSlug}...`,
        Effect.gen(function* () {
          const { sessionId } = yield* resolveToolRouterSession(client, resolvedUserId.value, {
            manageConnections: true,
          });
          return yield* Effect.tryPromise(() =>
            client.toolRouter.session.link(sessionId, { toolkit: toolkitSlug })
          );
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
        Effect.tap(() =>
          invalidateConsumerConnectedToolkitsCache().pipe(Effect.catchAll(() => Effect.void))
        )
      );

    if (Option.isNone(linkOpt)) return;

    const validatedLink = yield* validateLinkResponse(ui, linkOpt.value);
    if (Option.isNone(validatedLink)) return;

    const { connectedAccountId: connAccountId, redirectUrl } = validatedLink.value;

    if (params.noWait) {
      yield* showRedirectUrl(ui, redirectUrl, params.noBrowser);
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
      }).pipe(Effect.catchAll(() => Effect.void));
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
      }).pipe(Effect.catchAll(() => Effect.void));
    }
  });

export const connectedAccountsCmd$Link = Command.make(
  'link',
  { toolkit, authConfig, userId, projectName, noBrowser, noWait },
  ({ toolkit, authConfig, userId, projectName, noBrowser, noWait }) =>
    runConnectedAccountsLink({
      toolkit,
      authConfig,
      userId,
      projectName,
      noBrowser,
      noWait,
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
      '  composio link gmail --no-browser          Print the auth URL instead of opening it',
      '',
      'See also:',
      '  composio search "<query>"                 Find tools to use after linking',
      "  composio execute <slug> -d '{ ... }'      Execute a tool with your connected account",
    ].join('\n')
  )
);

export const rootConnectedAccountsCmd$Link = Command.make(
  'link',
  { toolkit, noBrowser, noWait },
  ({ toolkit, noBrowser, noWait }) =>
    runConnectedAccountsLink({
      toolkit,
      authConfig: Option.none(),
      userId: Option.none(),
      projectName: Option.none(),
      noBrowser,
      noWait,
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
      '  composio link gmail --no-browser          Print the auth URL instead of opening it',
      '',
      'See also:',
      '  composio search "<query>"                 Find tools to use after linking',
      "  composio execute <slug> -d '{ ... }'      Execute a tool with your connected account",
    ].join('\n')
  )
);
