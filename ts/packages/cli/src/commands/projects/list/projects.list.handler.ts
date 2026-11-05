import { Array as Arr, Effect, Option, String as Str } from 'effect';
import { commandInputError, notLoggedIn } from 'src/commands/errors';
import { listOrganizationProjects } from 'src/services/composio-account';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { clampLimit } from 'src/ui/clamp-limit';
import {
  FETCH_PROJECTS_FAILED_MESSAGE,
  LOADING_PROJECTS_MESSAGE,
  NO_CURRENT_ORG_MESSAGE,
  NO_CURRENT_ORG_OUTRO,
  NO_PROJECTS_MESSAGE,
  NO_PROJECTS_OUTRO,
  PROJECTS_LIST_INTRO,
  PROJECTS_LIST_OUTRO,
  formatProjectLines,
  formatProjectsJson,
  loadedProjectsMessage,
} from './projects.list.format';

/** The flags of `composio dev projects list`. */
export type ProjectsListParams = {
  readonly orgId: Option.Option<string>;
  readonly limit: number;
};

const invalidInput = commandInputError('dev projects list');

/**
 * Lists the developer projects of `--org-id`, or of the current global org. With neither, it
 * fails with a `CommandInputError` before any request.
 */
export const runProjectsList = ({ orgId, limit }: ProjectsListParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    // `requiresLogin` on the command has already proven the key is there.
    const apiKey = yield* Effect.fromOption(ctx.data.apiKey, notLoggedIn);

    yield* ui.intro(PROJECTS_LIST_INTRO);

    // An explicit `--org-id ""` does not fall back to the current org.
    const resolvedOrgId = Option.orElse(orgId, () => ctx.data.orgId).pipe(
      Option.filter(Str.isNonEmpty)
    );

    yield* Option.match(resolvedOrgId, {
      onNone: () =>
        Effect.fail(invalidInput(`${NO_CURRENT_ORG_MESSAGE}\n${NO_CURRENT_ORG_OUTRO}`, '--org-id')),
      onSome: resolvedOrgId =>
        Effect.gen(function* () {
          const projects = yield* ui.withSpinner(
            LOADING_PROJECTS_MESSAGE,
            listOrganizationProjects({ apiKey, orgId: resolvedOrgId, limit: clampLimit(limit) }),
            {
              successMessage: result => loadedProjectsMessage(result.data.length),
              errorMessage: FETCH_PROJECTS_FAILED_MESSAGE,
            }
          );

          yield* Arr.match(projects.data, {
            onEmpty: () =>
              Effect.gen(function* () {
                yield* ui.log.warn(NO_PROJECTS_MESSAGE);
                yield* ui.outro(NO_PROJECTS_OUTRO);
                // Piped callers need the parseable empty result, not silence.
                yield* ui.output(formatProjectsJson(projects.data));
              }),
            onNonEmpty: data =>
              Effect.gen(function* () {
                yield* ui.log.step(formatProjectLines(data));
                yield* ui.outro(PROJECTS_LIST_OUTRO);
                yield* ui.output(formatProjectsJson(data));
              }),
          });
        }),
    });
  });
