// --- stderr -----------------------------------------------------------------------------------

export const ORGS_SWITCH_INTRO = 'composio orgs switch';
export const CURRENT_ORG_NOTE_TITLE = 'Current org';
export const CURRENT_ORG_NOTE =
  'This updates your current org for CLI commands. Use `composio dev init` for local developer project setup.';
export const NO_ORG_SELECTED_OUTRO = 'No org selected.';
export const ORG_UPDATED_OUTRO = 'Current org updated.';

export const updatedOrgMessage = (orgName: string) => `Updated current org to "${orgName}".`;

// --- stdout -----------------------------------------------------------------------------------

/** The org now stored as the global default. */
export const formatSwitchedOrgJson = (orgId: string) =>
  JSON.stringify({
    scope: 'global',
    org_id: orgId,
  });
