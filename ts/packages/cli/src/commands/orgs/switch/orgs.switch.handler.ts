import { Effect, Option } from 'effect';
import { notLoggedIn } from 'src/commands/errors';
import { linkAnalyticsIdentityForOrg } from 'src/effects/link-analytics-identity';
import { runOrgSelection } from 'src/effects/select-org-project';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import {
  CURRENT_ORG_NOTE,
  CURRENT_ORG_NOTE_TITLE,
  NO_ORG_SELECTED_OUTRO,
  ORGS_SWITCH_INTRO,
  ORG_UPDATED_OUTRO,
  formatSwitchedOrgJson,
  updatedOrgMessage,
} from './orgs.switch.format';

/** The flags of `composio orgs switch`. */
export type OrgsSwitchParams = {
  readonly orgId: Option.Option<string>;
  readonly limit: number;
};

/**
 * Stores `--org-id`, or the org picked from the user's organizations, as the global default.
 * The stored API key and test user id are kept; analytics is linked to the new membership.
 */
export const runOrgsSwitch = ({ orgId, limit }: OrgsSwitchParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    // `requiresLogin` on the `orgs` group has already proven the key is there; the
    // filter also fails a stored empty key, which the login check counts as present.
    const apiKey = yield* Effect.fromOption(
      Option.filter(ctx.data.apiKey, key => key.length > 0),
      notLoggedIn
    );

    yield* ui.intro(ORGS_SWITCH_INTRO);
    yield* ui.note(CURRENT_ORG_NOTE, CURRENT_ORG_NOTE_TITLE);

    const selected = yield* runOrgSelection({
      apiKey,
      explicitOrgId: Option.getOrUndefined(orgId),
      currentOrgId: Option.getOrUndefined(ctx.data.orgId),
      limit,
    });

    yield* Option.match(Option.fromUndefinedOr(selected), {
      onNone: () => ui.outro(NO_ORG_SELECTED_OUTRO),
      onSome: org =>
        Effect.gen(function* () {
          // Same key, new org: the login's recorded backend stays as it is.
          yield* ctx.update({ orgId: Option.some(org.id) });
          yield* linkAnalyticsIdentityForOrg({ apiKey, orgId: org.id });

          yield* ui.log.success(updatedOrgMessage(org.name));
          yield* ui.output(formatSwitchedOrgJson(org.id));
          yield* ui.outro(ORG_UPDATED_OUTRO);
        }),
    });
  });
