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
export const TIMEOUT_WITHOUT_POLL_MESSAGE = '`--timeout` requires `--poll`.';

/** `--timeout` names something other than a whole number of seconds a pending login can last. */
export const invalidTimeoutMessage = (maxSeconds: number) =>
  `Invalid --timeout value. Use a whole number of seconds from 1 to ${maxSeconds}.`;

// --- stderr -----------------------------------------------------------------------------------

export const ALREADY_LOGGED_IN_MESSAGE = `You're already logged in!`;
export const ALREADY_LOGGED_IN_OUTRO =
  'If you want to log in with a different account, please run `composio logout` first.';
export const REAUTHENTICATING_MESSAGE = 'Re-authenticating for multi-project support...';

export const SESSION_NOT_FOUND_MESSAGE =
  'Session not found or expired. Run `composio login --no-wait` to get a new session.';
export const SESSION_NOT_LINKED_MESSAGE =
  'Login not complete. Open the URL and finish authentication.';
export const SESSION_NOT_LINKED_HINT = 'Then run `composio login --key <key>` again.';

/**
 * What a bounded wait answers when it runs out on a session that is still pending: the URL that
 * finishes the login, and the command that picks the same login up again. The URL and the
 * command are part of the message because a caller reading stderr through a pipe gets no
 * decoration and no spinner — this text is the whole answer.
 */
export const formatLoginStillPending = (params: {
  readonly status: string;
  readonly loginUrl: string;
  readonly resumeCommand: string;
}) => `Login still pending: session status is '${params.status}', waiting for 'linked'.

Open this URL and finish authenticating:

  ${params.loginUrl}

Then run this again to complete the login:

  ${params.resumeCommand}`;

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
