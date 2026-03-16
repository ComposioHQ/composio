import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { extractMessage } from 'src/utils/api-error-extraction';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
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

/**
 * View details of a specific toolkit including connection status.
 *
 * @example
 * ```bash
 * composio toolkits info "gmail"
 * composio toolkits info "github" --user-id "alice"
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

      // Missing slug guard
      if (Option.isNone(slug)) {
        yield* ui.log.warn('Missing required argument: <slug>');
        yield* ui.log.step(
          'Try specifying a toolkit slug, e.g.:\n> composio toolkits info "gmail"'
        );
        return;
      }

      const slugValue = slug.value;
      const repo = yield* ComposioToolkitsRepository;
      const resolvedProjectContext = yield* projectContext.resolve;
      const testUserId = Option.flatMap(resolvedProjectContext, keys => keys.testUserId);
      const globalTestUserId = userContext.data.testUserId;
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
            const detailedToolkitOpt = yield* repo
              .getToolkitDetailed(slugValue)
              .pipe(Effect.option);

            if (Option.isSome(resolvedUserId)) {
              const { client, sessionId } = yield* resolveToolRouterSession(resolvedUserId.value);
              const sessionToolkits = yield* Effect.tryPromise(() =>
                client.toolRouter.session.toolkits(sessionId, { toolkits: [slugValue] })
              );
              return { toolkit: sessionToolkits.items[0], detailedToolkitOpt };
            }

            const toolkit = Option.match(detailedToolkitOpt, {
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
            return { toolkit, detailedToolkitOpt };
          })
        )
        .pipe(
          Effect.asSome,
          Effect.catchAll(error =>
            Effect.gen(function* () {
              const message = extractMessage(error) ?? `Failed to fetch toolkit "${slugValue}".`;
              yield* ui.log.error(message);
              yield* Effect.logDebug('Toolkit info error:', error);
              yield* ui.log.step('Browse available toolkits:\n> composio toolkits list');
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
        const suggestions = yield* repo.searchToolkits({ search: slugValue, limit: 3 }).pipe(
          Effect.map(r =>
            r.items.map(s => ({
              label: `${s.slug} — ${s.meta.description}`,
              command: `> composio toolkits info "${s.slug}"`,
            }))
          ),
          Effect.catchAll(() => Effect.succeed([] as { label: string; command: string }[]))
        );

        const [first] = suggestions;
        if (first) {
          const lines = suggestions.map(s => `  ${s.label}`).join('\n');
          yield* ui.log.step(`Did you mean?\n${lines}\n\n${first.command}`);
        } else {
          yield* ui.log.step('Browse available toolkits:\n> composio toolkits list');
        }
        return;
      }

      yield* ui.log.message(
        `Toolkit: ${toolkit.name}\n\n${formatToolkitInfo(toolkit, detailedToolkit, allDetails)}`
      );

      // Next step hint
      yield* ui.log.step(
        `To list tools in this toolkit:\n> composio tools list --toolkits "${toolkit.slug}"`
      );

      yield* ui.output(formatToolkitInfoJson(toolkit, detailedToolkit, allDetails));
    })
).pipe(Command.withDescription('View details of a specific toolkit.'));
