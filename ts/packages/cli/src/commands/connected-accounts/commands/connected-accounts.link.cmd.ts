import { Args, Command, Options } from '@effect/cli';
import { Effect, Option, Schedule } from 'effect';
import open from 'open';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { extractMessage } from 'src/utils/api-error-extraction';
import { ProjectContext } from 'src/services/project-context';

const toolkit = Args.text({ name: 'toolkit' }).pipe(
  Args.withDescription('Toolkit slug to link (e.g. "github", "gmail")'),
  Args.optional
);

const authConfig = Options.text('auth-config').pipe(
  Options.withDescription('Auth config ID (e.g. "ac_..."). Uses legacy flow (no Tool Router).'),
  Options.optional
);

const userId = Options.text('user-id').pipe(
  Options.withDescription('User ID for the connection (falls back to project test_user_id)'),
  Options.optional
);

const noBrowser = Options.boolean('no-browser').pipe(
  Options.withDefault(false),
  Options.withDescription('Skip auto-opening the browser')
);

const noWait = Options.boolean('no-wait').pipe(
  Options.withDefault(false),
  Options.withDescription('Do not wait for authorization; only print link info')
);

/**
 * Open the browser and poll until the connected account becomes ACTIVE.
 * On success, outputs valid JSON to stdout for piping (e.g. to jq).
 */
const waitForActiveConnection = (
  ui: TerminalUI,
  repo: ComposioToolkitsRepository,
  connectedAccountId: string,
  redirectUrl: string,
  noBrowser: boolean
) =>
  Effect.gen(function* () {
    // Display the redirect URL (interactive only)
    yield* ui.note(redirectUrl, 'Redirect URL');

    if (!noBrowser) {
      // Validate URL scheme before opening — prevent non-HTTPS redirects
      let urlSchemeValid = false;
      try {
        const parsed = new URL(redirectUrl);
        urlSchemeValid = parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch {
        // Malformed URL — fall through to the warning below
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

    // Poll until the connected account becomes ACTIVE
    yield* ui.useMakeSpinner('Waiting for authentication...', spinner =>
      Effect.retry(
        Effect.gen(function* () {
          const account = yield* repo.getConnectedAccount(connectedAccountId);

          if (account.status === 'ACTIVE') {
            return account;
          }

          return yield* Effect.fail(
            new Error(`Connection status is still '${account.status}', waiting for 'ACTIVE'`)
          );
        }),
        // Exponential backoff: start with 0.3s, max 5s, up to 15 retries
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

/**
 * Link an external account via OAuth redirect.
 *
 * Two modes:
 * - **Tool Router** (default): `composio manage connected-accounts link <toolkit>`
 * - **Legacy**: `composio manage connected-accounts link --auth-config <id>`
 *
 * @example
 * ```bash
 * composio manage connected-accounts link github
 * composio manage connected-accounts link gmail --user-id "alice"
 * composio manage connected-accounts link --auth-config "ac_..." --user-id "default"
 * ```
 */
export const connectedAccountsCmd$Link = Command.make(
  'link',
  { toolkit, authConfig, userId, noBrowser, noWait },
  ({ toolkit, authConfig, userId, noBrowser, noWait }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;
      const projectContext = yield* ProjectContext;
      const userContext = yield* ComposioUserContext;
      const resolvedProjectContext = yield* projectContext.resolve;
      const testUserId = Option.flatMap(resolvedProjectContext, keys => keys.testUserId);
      const globalTestUserId = userContext.data.testUserId;
      const resolvedUserId = Option.match(userId, {
        onSome: value => Option.some(value),
        onNone: () => Option.orElse(testUserId, () => globalTestUserId),
      });
      if (Option.isNone(resolvedUserId)) {
        return yield* Effect.fail(
          new Error('Missing user id. Provide --user-id or run composio init to set test_user_id.')
        );
      }
      if (Option.isNone(userId) && Option.isSome(testUserId)) {
        yield* ui.log.warn(`Using test user id "${testUserId.value}"`);
      } else if (Option.isNone(userId) && Option.isSome(globalTestUserId)) {
        yield* ui.log.warn(`Using global test user id "${globalTestUserId.value}"`);
      }

      // Validate: exactly one of <toolkit> or --auth-config must be provided
      if (Option.isSome(toolkit) && Option.isSome(authConfig)) {
        yield* ui.log.error(
          'Cannot use both <toolkit> and --auth-config. Choose one:\n' +
            '  Tool Router: composio manage connected-accounts link <toolkit>\n' +
            '  Legacy:      composio manage connected-accounts link --auth-config <id>'
        );
        return;
      }

      if (Option.isNone(toolkit) && Option.isNone(authConfig)) {
        yield* ui.log.error(
          'Missing argument. Provide a toolkit slug or --auth-config:\n' +
            '  composio manage connected-accounts link github\n' +
            '  composio manage connected-accounts link --auth-config "ac_..."'
        );
        return;
      }

      if (Option.isSome(authConfig)) {
        // Path A: Legacy flow — use existing client.link.create()
        const linkOpt = yield* ui
          .withSpinner(
            'Creating link session...',
            repo.createConnectedAccountLink({
              auth_config_id: authConfig.value,
              user_id: resolvedUserId.value,
            })
          )
          .pipe(
            Effect.asSome,
            Effect.catchTag(
              'services/HttpServerError',
              handleHttpServerError(ui, {
                fallbackMessage: `Failed to create link for auth config "${authConfig.value}".`,
                hint: 'Browse available auth configs:\n> composio manage auth-configs list',
                fallbackValue: Option.none(),
              })
            )
          );

        if (Option.isNone(linkOpt)) {
          return;
        }

        const { connected_account_id: connId, redirect_url: redirectUrl } = linkOpt.value;

        if (noWait) {
          yield* ui.note(redirectUrl, 'Redirect URL');
          yield* ui.output(
            JSON.stringify(
              {
                status: 'pending',
                message: 'Complete authorization by opening the URL',
                connected_account_id: connId,
                redirect_url: redirectUrl,
              },
              null,
              2
            )
          );
        } else {
          yield* waitForActiveConnection(ui, repo, connId, redirectUrl, noBrowser);
        }
      } else {
        // Path B: Tool Router flow — toolkit is guaranteed Some (validated above)
        const toolkitSlug = Option.getOrThrow(toolkit);

        const linkOpt = yield* ui
          .withSpinner(
            `Linking ${toolkitSlug}...`,
            Effect.gen(function* () {
              const { client, sessionId } = yield* resolveToolRouterSession(resolvedUserId.value, {
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
                const message =
                  extractMessage(error) ?? `Failed to create link for toolkit "${toolkitSlug}".`;
                yield* ui.log.error(message);
                yield* Effect.logDebug('Link error:', error);
                yield* ui.log.step('Browse available toolkits:\n> composio manage toolkits list');
                return Option.none();
              })
            )
          );

        if (Option.isNone(linkOpt)) {
          return;
        }

        const { connected_account_id: connAccountId, redirect_url: redirectUrl } = linkOpt.value;
        if (!connAccountId || !redirectUrl) {
          yield* ui.log.error(
            'The API returned an incomplete link response (missing connected_account_id or redirect_url).'
          );
          yield* Effect.logDebug('Link response:', linkOpt.value);
          return;
        }

        if (noWait) {
          yield* ui.note(redirectUrl, 'Redirect URL');
          yield* ui.output(
            JSON.stringify(
              {
                status: 'pending',
                message: 'Complete authorization by opening the URL',
                connected_account_id: connAccountId,
                redirect_url: redirectUrl,
                toolkit: toolkitSlug,
              },
              null,
              2
            )
          );
        } else {
          yield* waitForActiveConnection(ui, repo, connAccountId, redirectUrl, noBrowser);
        }
      }
    })
).pipe(Command.withDescription('Link an external account via OAuth redirect.'));
