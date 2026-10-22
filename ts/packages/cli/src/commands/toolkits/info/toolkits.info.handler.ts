import { Effect, Option } from 'effect';
import { ComposioClientSingleton, ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { idempotent } from 'src/services/composio-request';
import { failedWith } from 'src/effects/request-error';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { extractMessage } from 'src/utils/api-error-extraction';
import { ProjectContext } from 'src/services/project-context';
import { ComposioUserContext } from 'src/services/user-context';
import { CommandSurface, directoryTestUserId, namedProject } from 'src/commands/surface';
import { formatToolkitInfo, formatToolkitInfoJson } from '../format';
import { ToolkitsInfoRequestError } from './toolkits.info.errors';

export type ToolkitsInfoParams = {
  readonly slug: Option.Option<string>;
  readonly allDetails: boolean;
};

/**
 * Shows a toolkit with its connection status for the surface's user: the `dev`
 * group's `--user-id`, then the project test user id, then the global one.
 */
export const runToolkitsInfo = ({ slug, allDetails }: ToolkitsInfoParams) =>
  Effect.gen(function* () {
    const { userId } = yield* CommandSurface;
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
    // Resolved outside the session lookup, whose failures only drop the connection status.
    const project = yield* namedProject;
    const repo = yield* ComposioToolkitsRepository;
    const resolvedProjectContext = yield* projectContext.resolve;
    const testUserId = directoryTestUserId(
      resolvedProjectContext,
      Option.map(project, named => named.projectId)
    );
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
          const detailedToolkitOpt = yield* repo.getToolkitDetailed(slugValue).pipe(Effect.option);

          if (Option.isSome(resolvedUserId)) {
            const client = Option.isSome(project)
              ? project.value.client
              : yield* clientSingleton.get();
            const { sessionId } = yield* resolveToolRouterSession(client, resolvedUserId.value);
            const sessionToolkits = yield* client.toolRouter.session
              // Only the first item is read, and only a few of its fields.
              .toolkits(sessionId, { toolkits: [slugValue] }, idempotent)
              .pipe(
                failedWith(ToolkitsInfoRequestError, `Failed to fetch toolkit "${slugValue}".`)
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
        Effect.catch(error =>
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
      const suggestions = yield* repo.searchToolkits({ search: slugValue, limit: 3 }).pipe(
        Effect.map(r =>
          r.items.map(s => ({
            label: `${s.slug} — ${s.meta.description}`,
            command: `> composio dev toolkits info "${s.slug}"`,
          }))
        ),
        Effect.catch(() => Effect.succeed([] as { label: string; command: string }[]))
      );

      const [first] = suggestions;
      if (first) {
        const lines = suggestions.map(s => `  ${s.label}`).join('\n');
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
  });
