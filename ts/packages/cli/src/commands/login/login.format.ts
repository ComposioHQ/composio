import { Array as Arr } from 'effect';
import type { OrganizationSummary } from 'src/services/composio-account';

// --- usage messages ---------------------------------------------------------------------------

export const KEY_AND_USER_API_KEY_MESSAGE = 'Use either `--key` or `--user-api-key`, not both.';
export const POLL_WITH_OTHER_FLAGS_MESSAGE =
  '`--poll` cannot be combined with browser, session, direct-login, or agent flags.';
export const AGENT_WITH_OTHER_FLAGS_MESSAGE =
  '`--agent` cannot be combined with browser, session, or direct-login flags.';
export const ORG_WITHOUT_USER_API_KEY_MESSAGE = '`--org` requires `--user-api-key`.';
export const USER_API_KEY_WITH_SESSION_FLAGS_MESSAGE =
  '`--user-api-key` is a direct login path and cannot be combined with browser or session flags.';

// --- stderr -----------------------------------------------------------------------------------

export const ALREADY_LOGGED_IN_MESSAGE = `You're already logged in!`;
export const ALREADY_LOGGED_IN_OUTRO =
  'If you want to log in with a different account, please run `composio logout` first.';
export const REAUTHENTICATING_MESSAGE = 'Re-authenticating for multi-project support...';

export const KEY_NOT_PENDING_MESSAGE =
  '`--key` completes only the login this machine started last. Run `composio login --poll` to complete it, or `composio login` to start a new login.';
export const OUTDATED_PENDING_LOGIN_MESSAGE =
  'The pending login was started by an older Composio CLI and cannot be completed. Run `composio login` to start a new login.';
export const SESSION_NOT_LINKED_MESSAGE =
  'Login not complete. Open the URL and finish authentication.';
export const SESSION_NOT_LINKED_HINT = 'Then run `composio login --key <key>` again.';

export const organizationNotFoundMessage = (requestedOrg: string) =>
  `Organization "${requestedOrg}" was not found for this API key.`;
export const INVALID_ORGANIZATION_MESSAGE =
  'Invalid organization. Run `composio orgs list` to inspect available orgs.';

/** What `composio login --poll` completed: the account, its current org, and the others. */
export type PollLoginSummary = {
  readonly email?: string;
  readonly defaultOrgId: string;
  readonly defaultOrgName?: string;
  readonly organizations: ReadonlyArray<OrganizationSummary>;
};

const SWITCH_ORG_COMMAND = 'composio orgs switch --org-id <org_id>';

/** The note `composio login --poll` prints once the login completes. */
export const formatPollLoginComplete = (summary: PollLoginSummary) => {
  const orgLines = Arr.match(summary.organizations, {
    onEmpty: () => '  No organizations were returned for this account.',
    onNonEmpty: organizations =>
      organizations
        .map(org => `  ${org.id === summary.defaultOrgId ? '*' : '-'} ${org.name} (${org.id})`)
        .join('\n'),
  });

  return `Login complete${summary.email ? ` for ${summary.email}` : ''}.

Current org:

  ${summary.defaultOrgName ?? summary.defaultOrgId} (${summary.defaultOrgId})

Available organizations:

${orgLines}

The CLI selected the first organization as your current org. To choose a different current org, run:

  ${SWITCH_ORG_COMMAND}`;
};

// --- stdout -----------------------------------------------------------------------------------

/** The stdout payload of `composio login --poll`. */
export const formatPollLoginJson = (summary: PollLoginSummary) =>
  JSON.stringify(
    {
      email: summary.email ?? null,
      current_org: {
        id: summary.defaultOrgId,
        name: summary.defaultOrgName ?? summary.defaultOrgId,
      },
      organizations: summary.organizations.map(org => ({
        id: org.id,
        name: org.name,
        selected: org.id === summary.defaultOrgId,
      })),
      switch_command: SWITCH_ORG_COMMAND,
    },
    null,
    2
  );
