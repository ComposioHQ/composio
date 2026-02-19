import { Command, Options } from '@effect/cli';
import { Effect, Option, Schedule } from 'effect';
import open from 'open';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';

const authConfig = Options.text('auth-config').pipe(
  Options.withDescription('Auth config ID (e.g. "ac_...")')
);

const userId = Options.text('user-id').pipe(
  Options.withDescription('User ID for the connection'),
  Options.withDefault('default')
);

const noBrowser = Options.boolean('no-browser').pipe(
  Options.withDefault(false),
  Options.withDescription('Skip auto-opening the browser')
);

/**
 * Link an external account by creating an OAuth redirect session.
 *
 * Opens the browser to the redirect URL and polls until the connection
 * becomes ACTIVE.
 *
 * @example
 * ```bash
 * composio connected-accounts link --auth-config "ac_..." --user-id "default"
 * composio connected-accounts link --auth-config "ac_..." --no-browser
 * ```
 */
export const connectedAccountsCmd$Link = Command.make(
  'link',
  { authConfig, userId, noBrowser },
  ({ authConfig, userId, noBrowser }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;

      // Create the link session
      const linkOpt = yield* ui
        .withSpinner(
          'Creating link session...',
          repo.createConnectedAccountLink({
            auth_config_id: authConfig,
            user_id: userId,
          })
        )
        .pipe(
          Effect.asSome,
          Effect.catchTag(
            'services/HttpServerError',
            handleHttpServerError(ui, {
              fallbackMessage: `Failed to create link for auth config "${authConfig}".`,
              hint: 'Browse available auth configs:\n> composio auth-configs list',
              fallbackValue: Option.none(),
            })
          )
        );

      if (Option.isNone(linkOpt)) {
        return;
      }

      const { connected_account_id, redirect_url } = linkOpt.value;

      // Display the redirect URL
      yield* ui.note(redirect_url, 'Redirect URL');
      yield* ui.output(redirect_url);

      if (!noBrowser) {
        yield* Effect.tryPromise(() => open(redirect_url, { wait: false })).pipe(
          Effect.catchAll(error =>
            Effect.gen(function* () {
              yield* Effect.logDebug('Failed to open browser:', error);
              yield* ui.log.warn('Could not open the browser automatically.');
              yield* ui.log.info('Tip: try using `--no-browser` and open the URL manually.');
            })
          )
        );
      }

      // Poll until the connected account becomes ACTIVE
      yield* ui.useMakeSpinner('Waiting for authentication...', spinner =>
        Effect.retry(
          Effect.gen(function* () {
            const account = yield* repo.getConnectedAccount(connected_account_id);

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
            return Effect.all([
              spinner.stop('Connection successful'),
              ui.log.success(
                `Connected account "${account.id}" is now ACTIVE (toolkit: ${account.toolkit.slug}).`
              ),
            ]);
          }),
          Effect.tapError(() => spinner.error('Connection timed out. Please try again.'))
        )
      );
    })
).pipe(Command.withDescription('Link an external account via OAuth redirect.'));
