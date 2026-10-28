import { Effect, Option } from 'effect';
import { ComposioClientSingleton, ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { idempotent } from 'src/services/composio-request';
import { failedWith } from 'src/effects/request-error';
import { resolveToolRouterSession } from 'src/effects/create-tool-router-session';
import { extractMessage } from 'src/utils/api-error-extraction';
import { reportFailure } from 'src/effects/report-failure';
import { commandInputError } from 'src/commands/errors';
import { actingUserOption } from 'src/commands/surface';
import { BROWSE_TOOLKITS_HINT, formatToolkitInfo, formatToolkitInfoJson } from '../format';
import { ToolkitsInfoRequestError } from './toolkits.info.errors';

export type ToolkitsInfoParams = {
  readonly slug: Option.Option<string>;
  readonly allDetails: boolean;
};

const invalidInput = commandInputError('dev toolkits info');

/**
 * Shows a toolkit with its connection status for the surface's user: the `dev`
 * group's `--user-id`, then the project test user id, then the global one. A missing
 * `<slug>` fails with a `CommandInputError` before any request; a failed lookup or an
 * unknown toolkit is reported on stderr and exits 1.
 */
export const runToolkitsInfo = ({ slug, allDetails }: ToolkitsInfoParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;

    if (Option.isNone(slug)) {
      return yield* invalidInput(
        'Missing required argument: <slug>\nTry specifying a toolkit slug, e.g.:\n> composio dev toolkits info "gmail"',
        '<slug>'
      );
    }

    const slugValue = slug.value;
    // Resolved outside the session lookup, whose failures only drop the connection status.
    const acting = yield* actingUserOption();
    const repo = yield* ComposioToolkitsRepository;
    // The client of the project --project-name names; none keeps the default client.
    const namedClient = yield* Effect.transposeOption(
      Option.map(
        Option.flatMap(acting, found => found.project),
        project => clientSingleton.getFor({ orgId: project.orgId, projectId: project.projectId })
      )
    );
    const resolvedUserId = Option.map(acting, found => found.userId);

    if (Option.isNone(acting)) {
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
            const client = Option.isSome(namedClient)
              ? namedClient.value
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
            yield* Effect.logDebug('Toolkit info error:', error);
            yield* reportFailure(ui, message, BROWSE_TOOLKITS_HINT);
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
      const hint = first
        ? `Did you mean?\n${suggestions.map(s => `  ${s.label}`).join('\n')}\n\n${first.command}`
        : BROWSE_TOOLKITS_HINT;
      yield* reportFailure(ui, `Toolkit "${slugValue}" not found.`, hint);
      return;
    }

    yield* ui.log.message(
      `Toolkit: ${toolkit.name}\n\n${formatToolkitInfo(toolkit, detailedToolkit, allDetails)}`
    );

    // Next step hint
    yield* ui.log.step(`To list tools in this toolkit:\n> composio tools list "${toolkit.slug}"`);

    yield* ui.output(formatToolkitInfoJson(toolkit, detailedToolkit, allDetails));
  });
