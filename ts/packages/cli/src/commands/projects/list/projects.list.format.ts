import type { OrganizationSummary } from 'src/services/composio-account';

// --- stderr -----------------------------------------------------------------------------------

export const PROJECTS_LIST_INTRO = 'composio dev projects list';
export const NO_CURRENT_ORG_MESSAGE = 'No current org is configured.';
export const NO_CURRENT_ORG_OUTRO = 'Hint: run `composio orgs switch` first, or pass `--org-id`.';
export const LOADING_PROJECTS_MESSAGE = 'Loading projects...';
export const FETCH_PROJECTS_FAILED_MESSAGE = 'Failed to fetch projects';
export const NO_PROJECTS_MESSAGE = 'No projects found.';

const INIT_HINT = 'Hint: run `composio dev init` in a directory to bind it to a developer project.';

export const NO_PROJECTS_OUTRO = INIT_HINT;
export const PROJECTS_LIST_OUTRO = [
  INIT_HINT,
  'Run `composio orgs switch` to change your current org.',
].join('\n');

export const loadedProjectsMessage = (count: number) => `Loaded ${count} projects`;

/** One indented line per project. */
export const formatProjectLines = (projects: ReadonlyArray<OrganizationSummary>) =>
  projects.map(project => `  ${project.name} (${project.id})`).join('\n');

// --- stdout -----------------------------------------------------------------------------------

/**
 * The projects as JSON. No project is ever the selected global one, since the CLI binds
 * developer projects per directory.
 */
export const formatProjectsJson = (projects: ReadonlyArray<OrganizationSummary>) =>
  JSON.stringify(
    projects.map(project => ({
      id: project.id,
      name: project.name,
      is_selected_global_project: false,
    }))
  );
