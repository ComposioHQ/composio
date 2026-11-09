import { Array as Arr, Effect } from 'effect';
import { notLoggedIn } from 'src/commands/errors';
import { listOrganizations } from 'src/services/composio-account';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { clampLimit } from 'src/ui/clamp-limit';
import {
  FETCH_ORGANIZATIONS_FAILED_MESSAGE,
  LOADING_ORGANIZATIONS_MESSAGE,
  NO_ORGANIZATIONS_MESSAGE,
  ORGS_LIST_INTRO,
  ORGS_LIST_OUTRO,
  formatOrganizationLines,
  formatOrganizationsJson,
  loadedOrganizationsMessage,
} from './orgs.list.format';

/** The flags of `composio orgs list`. */
export type OrgsListParams = {
  readonly limit: number;
};

/** Lists the user's organizations and marks the current global one. */
export const runOrgsList = ({ limit }: OrgsListParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    // `requiresLogin` on the `orgs` group has already proven the key is there.
    const apiKey = yield* Effect.fromOption(ctx.data.apiKey, notLoggedIn);
    const currentOrgId = ctx.data.orgId;

    yield* ui.intro(ORGS_LIST_INTRO);

    const organizations = yield* ui.withSpinner(
      LOADING_ORGANIZATIONS_MESSAGE,
      listOrganizations({ apiKey, limit: clampLimit(limit) }),
      {
        successMessage: result => loadedOrganizationsMessage(result.data.length),
        errorMessage: FETCH_ORGANIZATIONS_FAILED_MESSAGE,
      }
    );

    yield* Arr.match(organizations.data, {
      onEmpty: () => ui.log.warn(NO_ORGANIZATIONS_MESSAGE),
      onNonEmpty: data =>
        Effect.gen(function* () {
          yield* ui.log.info(formatOrganizationLines(data, currentOrgId));
          yield* ui.outro(ORGS_LIST_OUTRO);
          yield* ui.output(formatOrganizationsJson(data, currentOrgId));
        }),
    });
  });
