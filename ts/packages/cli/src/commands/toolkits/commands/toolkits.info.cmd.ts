import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioClientSingleton, ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { extractMessage } from 'src/utils/api-error-extraction';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import type { Toolkit, ToolkitDetailed } from 'src/models/toolkits';
import { formatToolkitInfo, formatToolkitInfoJson } from '../format';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Toolkit slug (e.g. "gmail")'),
  Args.optional
);

const userId = Options.text('user-id').pipe(
  Options.optional,
  Options.withDescription(
    'User ID for connection status (falls back to project/global test_user_id, then "default")'
  )
);

const allDetails = Options.boolean('all').pipe(
  Options.withAlias('a'),
  Options.withDefault(false),
  Options.withDescription('Show all available toolkit details, including auth config fields')
);

const TOOLKIT_INFO_METADATA_TIMEOUT_MS = 10_000;
const TOOLKIT_INFO_SESSION_TIMEOUT_MS = 10_000;
const TOOLKIT_INFO_SUGGESTIONS_TIMEOUT_MS = 5_000;
const TOOLKIT_INFO_SEARCH_FALLBACK_LIMIT = 50;

const getOptionalResultWithTimeout = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeoutMs: number,
  timeoutMessage: string,
  failureMessage: string
): Effect.Effect<Option.Option<A>, never, R> =>
  Effect.raceFirst(
    Effect.disconnect(
      effect.pipe(
        Effect.asSome,
        Effect.catchAll(error =>
          Effect.logDebug(failureMessage, error).pipe(Effect.as(Option.none<A>()))
        )
      )
    ),
    Effect.disconnect(
      Effect.sleep(timeoutMs).pipe(
        Effect.zipRight(Effect.logDebug(timeoutMessage)),
        Effect.as(Option.none<A>())
      )
    )
  );

const getOptionalValueWithTimeout = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeoutMs: number,
  timeoutMessage: string,
  failureMessage: string
): Effect.Effect<A | undefined, never, R> =>
  getOptionalResultWithTimeout(effect, timeoutMs, timeoutMessage, failureMessage).pipe(
    Effect.map(Option.getOrUndefined)
  );

const findToolkitBySlug = <A extends { slug: string }>(
  items: ReadonlyArray<A>,
  slug: string
): Option.Option<A> => {
  const normalizedSlug = slug.trim().toLowerCase();
  return Option.fromNullable(items.find(item => item.slug.trim().toLowerCase() === normalizedSlug));
};

/**
 * View details of a specific toolkit including connection status.
 *
 * @example
 * ```bash
 * composio dev toolkits info "gmail"
 * composio dev toolkits info "github" --user-id "alice"
 * ```
 */
export const toolkitsCmd$Info = Command.make(
  'info',
  { slug, userId, allDetails },
  ({ slug, userId, allDetails }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const projectContext = yield* ProjectContext;
      const userContext = yield* ComposioUserContext;
      const clientSingleton = yield* ComposioClientSingleton;

      // Missing slug guard
      if (Option.isNone(slug)) {
        yield* ui.log.warn('Missing required argument: <slug>');
        yield* ui.log.step(
          'Try specifying a toolkit slug, e.g.:\n> composio dev toolkits info "gmail"'
        );
        return;
      }

      const slugValue = slug.value;
      const repo = yield* ComposioToolkitsRepository;
      const resolvedProjectContext = yield* projectContext.resolve;
      const testUserId = Option.flatMap(resolvedProjectContext, keys => keys.testUserId);
      const globalTestUserId = userContext.data.testUserId;
      const fallbackToolkitFromCatalog = (catalogToolkitOpt: Option.Option<Toolkit>) =>
        Option.match(catalogToolkitOpt, {
          onNone: () => undefined,
          onSome: toolkit => ({
            slug: toolkit.slug,
            name: toolkit.name,
            meta: {
              description: toolkit.meta.description,
              logo: '',
            },
            is_no_auth: toolkit.no_auth,
            enabled: true,
            connected_account: null,
            composio_managed_auth_schemes: [...toolkit.composio_managed_auth_schemes],
          }),
        });
      const fallbackToolkitFromDetailed = (detailedToolkitOpt: Option.Option<ToolkitDetailed>) =>
        Option.match(detailedToolkitOpt, {
          onNone: () => undefined,
          onSome: detailed => ({
            slug: detailed.slug,
            name: detailed.name,
            meta: {
              description: detailed.meta.description,
              logo: '',
            },
            is_no_auth: detailed.no_auth,
            enabled: true,
            connected_account: null,
            composio_managed_auth_schemes: [...detailed.composio_managed_auth_schemes],
          }),
        });
      const resolvedUserId = Option.match(userId, {
        onSome: value => Option.some(value),
        onNone: () => Option.orElse(testUserId, () => globalTestUserId),
      });

      if (Option.isNone(userId) && Option.isSome(testUserId)) {
        yield* ui.log.warn(`Using test user id "${testUserId.value}"`);
      } else if (Option.isNone(userId) && Option.isSome(globalTestUserId)) {
        yield* ui.log.warn(`Using global test user id "${globalTestUserId.value}"`);
      } else if (Option.isNone(userId)) {
        yield* ui.log.info(
          'No test user id found; showing toolkit details without connection status.'
        );
      }

      const resultOpt = yield* ui
        .withSpinner(
          `Fetching toolkit "${slugValue}"...`,
          Effect.gen(function* () {
            const [detailedToolkitOpt, catalogToolkitOpt, sessionToolkit] = yield* Effect.all(
              [
                getOptionalResultWithTimeout(
                  repo.getToolkitDetailed(slugValue),
                  TOOLKIT_INFO_METADATA_TIMEOUT_MS,
                  `Timed out fetching detailed toolkit info for "${slugValue}".`,
                  'Failed to fetch detailed toolkit info:'
                ),
                Effect.all(
                  [
                    getOptionalResultWithTimeout(
                      repo
                        .getToolkitsBySlugs([slugValue])
                        .pipe(Effect.map(toolkits => findToolkitBySlug(toolkits, slugValue))),
                      TOOLKIT_INFO_METADATA_TIMEOUT_MS,
                      `Timed out fetching toolkit "${slugValue}" by slug.`,
                      'Failed to fetch toolkit by slug:'
                    ).pipe(Effect.map(Option.flatten)),
                    getOptionalResultWithTimeout(
                      repo
                        .searchToolkits({
                          search: slugValue,
                          limit: TOOLKIT_INFO_SEARCH_FALLBACK_LIMIT,
                        })
                        .pipe(Effect.map(result => findToolkitBySlug(result.items, slugValue))),
                      TOOLKIT_INFO_SUGGESTIONS_TIMEOUT_MS,
                      `Timed out fetching toolkit search fallback for "${slugValue}".`,
                      'Failed to fetch toolkit search fallback:'
                    ).pipe(Effect.map(Option.flatten)),
                  ],
                  { concurrency: 'unbounded' }
                ).pipe(
                  Effect.map(([retrievedToolkitOpt, searchedToolkitOpt]) =>
                    Option.orElse(retrievedToolkitOpt, () => searchedToolkitOpt)
                  )
                ),
                Option.isSome(resolvedUserId)
                  ? Effect.gen(function* () {
                      const client = yield* clientSingleton.get();
                      return yield* getOptionalValueWithTimeout(
                        resolveToolRouterSession(client, resolvedUserId.value).pipe(
                          Effect.flatMap(({ sessionId }) =>
                            Effect.tryPromise(() =>
                              client.toolRouter.session.toolkits(sessionId, {
                                toolkits: [slugValue],
                              })
                            )
                          ),
                          Effect.map(response => response.items[0])
                        ),
                        TOOLKIT_INFO_SESSION_TIMEOUT_MS,
                        `Timed out fetching session toolkit info for "${slugValue}".`,
                        'Failed to fetch session toolkit info:'
                      );
                    })
                  : Effect.succeed(undefined),
              ],
              { concurrency: 'unbounded' }
            );
            const fallbackToolkit =
              fallbackToolkitFromDetailed(detailedToolkitOpt) ??
              fallbackToolkitFromCatalog(catalogToolkitOpt);

            return { toolkit: sessionToolkit ?? fallbackToolkit, detailedToolkitOpt };
          })
        )
        .pipe(
          Effect.asSome,
          Effect.catchAll(error =>
            Effect.gen(function* () {
              const message = extractMessage(error) ?? `Failed to fetch toolkit "${slugValue}".`;
              yield* ui.log.error(message);
              yield* Effect.logDebug('Toolkit info error:', error);
              yield* ui.log.step('Browse available toolkits:\n> composio dev toolkits list');
              return Option.none();
            })
          )
        );

      if (Option.isNone(resultOpt)) {
        return;
      }

      const result = resultOpt.value;
      const toolkit = result.toolkit;
      const detailedToolkit = Option.getOrUndefined(result.detailedToolkitOpt);

      if (!toolkit) {
        yield* ui.log.warn(`Toolkit "${slugValue}" not found.`);

        // "Did you mean?" suggestions via legacy search
        const suggestions = yield* getOptionalResultWithTimeout(
          repo.searchToolkits({ search: slugValue, limit: 3 }).pipe(
            Effect.map(r =>
              r.items.map(s => ({
                label: `${s.slug} — ${s.meta.description}`,
                command: `> composio dev toolkits info "${s.slug}"`,
              }))
            )
          ),
          TOOLKIT_INFO_SUGGESTIONS_TIMEOUT_MS,
          `Timed out fetching toolkit suggestions for "${slugValue}".`,
          'Failed to fetch toolkit suggestions:'
        );

        const [first] = Option.getOrElse(
          suggestions,
          () => [] as { label: string; command: string }[]
        );
        if (first) {
          const lines = Option.getOrElse(
            suggestions,
            () => [] as { label: string; command: string }[]
          )
            .map(s => `  ${s.label}`)
            .join('\n');
          yield* ui.log.step(`Did you mean?\n${lines}\n\n${first.command}`);
        } else {
          yield* ui.log.step('Browse available toolkits:\n> composio dev toolkits list');
        }
        return;
      }

      yield* ui.log.message(
        `Toolkit: ${toolkit.name}\n\n${formatToolkitInfo(toolkit, detailedToolkit, allDetails)}`
      );

      // Next step hint
      yield* ui.log.step(`To list tools in this toolkit:\n> composio tools list "${toolkit.slug}"`);

      yield* ui.output(formatToolkitInfoJson(toolkit, detailedToolkit, allDetails));
    })
).pipe(Command.withDescription('View details of a specific toolkit.'));
