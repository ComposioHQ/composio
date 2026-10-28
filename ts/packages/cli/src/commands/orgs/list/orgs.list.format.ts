import { Option } from 'effect';
import type { OrganizationSummary } from 'src/services/composio-account';

// --- stderr -----------------------------------------------------------------------------------

/** The intro `orgs list` prints; `orgs` is a root command only. */
export const ORGS_LIST_INTRO = 'composio orgs list';
export const LOADING_ORGANIZATIONS_MESSAGE = 'Loading organizations...';
export const FETCH_ORGANIZATIONS_FAILED_MESSAGE = 'Failed to fetch organizations';
export const NO_ORGANIZATIONS_MESSAGE = 'No organizations found.';
export const ORGS_LIST_OUTRO =
  'Hint: run `composio orgs switch` to switch the default global org/project.';

export const loadedOrganizationsMessage = (count: number) => `Loaded ${count} orgs`;

const isSelected = (org: OrganizationSummary, currentOrgId: Option.Option<string>) =>
  Option.contains(currentOrgId, org.id);

/** One line per organization, the current one marked with `✓`. */
export const formatOrganizationLines = (
  organizations: ReadonlyArray<OrganizationSummary>,
  currentOrgId: Option.Option<string>
) =>
  organizations
    .map(org => `${isSelected(org, currentOrgId) ? '✓' : ' '} ${org.name} (${org.id})`)
    .join('\n');

// --- stdout -----------------------------------------------------------------------------------

/** The organizations as JSON, each flagged when it is the current global org. */
export const formatOrganizationsJson = (
  organizations: ReadonlyArray<OrganizationSummary>,
  currentOrgId: Option.Option<string>
) =>
  JSON.stringify(
    organizations.map(org => ({
      id: org.id,
      name: org.name,
      is_selected_global_org: isSelected(org, currentOrgId),
    }))
  );
