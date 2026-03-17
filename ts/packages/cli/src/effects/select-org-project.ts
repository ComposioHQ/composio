import { Effect } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  listOrganizationProjects,
  listOrganizations,
  type OrganizationProjectSummary,
  type OrganizationSummary,
} from 'src/services/composio-clients';
import { clampLimit } from 'src/ui/clamp-limit';

const DEFAULT_LIMIT = 50;

/** Prompts user to select an org, or auto-selects if only one. */
const selectOrganization = (organizations: ReadonlyArray<OrganizationSummary>) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    if (organizations.length === 0) return undefined;
    if (organizations.length === 1) return organizations[0];
    return yield* ui.select('Select a default organization (global scope):', [
      ...organizations.map(org => ({ value: org, label: org.name, hint: org.id })),
    ]);
  });

/**
 * Prompts user to select a project, or auto-selects if only one.
 * When explicitProjectId is provided (e.g. from `orgs switch --project-id`), finds and returns it without prompting.
 */
const selectProject = (
  projects: ReadonlyArray<OrganizationProjectSummary>,
  explicitProjectId?: string
) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    if (projects.length === 0) return undefined;
    if (explicitProjectId) {
      const match = projects.find(p => p.id === explicitProjectId);
      if (match) return match;
    }
    if (projects.length === 1) return projects[0];
    return yield* ui.select('Select a default project (global scope):', [
      ...projects.map(project => ({ value: project, label: project.name, hint: project.id })),
    ]);
  });

/**
 * Runs the org/project selection flow: lists orgs, prompts for org (or auto-selects if 1),
 * lists projects, prompts for project (or auto-selects if 1).
 *
 * Reused by `composio manage orgs switch` and `composio login -y`.
 *
 * @param params.apiKey - User API key for API calls
 * @param params.baseURL - API base URL
 * @param params.explicitOrgId - If provided, skip org picker and use this org
 * @param params.explicitProjectId - If provided (and org selected), skip project picker
 * @param params.limit - Max orgs/projects to fetch (default 50)
 */
export const runOrgProjectSelection = (params: {
  apiKey: string;
  baseURL: string;
  explicitOrgId?: string;
  explicitProjectId?: string;
  limit?: number;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { apiKey, baseURL, explicitOrgId, explicitProjectId, limit = DEFAULT_LIMIT } = params;
    const clampedLimit = clampLimit(limit);

    const selectedOrganization =
      explicitOrgId !== undefined
        ? ({ id: explicitOrgId, name: explicitOrgId } satisfies OrganizationSummary)
        : yield* Effect.gen(function* () {
            const organizations = yield* listOrganizations({
              baseURL,
              apiKey,
              limit: clampedLimit,
            });
            yield* ui.log.info(`Loaded ${organizations.data.length} orgs`);
            if (organizations.data.length === 0) return undefined;
            return yield* selectOrganization(organizations.data);
          });

    if (!selectedOrganization) {
      yield* ui.log.warn('No organizations found for this API key.');
      return undefined;
    }
    yield* ui.log.info(
      `Selected organization: "${selectedOrganization.name}" (${selectedOrganization.id})`
    );

    const projects = yield* listOrganizationProjects({
      baseURL,
      apiKey,
      orgId: selectedOrganization.id,
      limit: clampedLimit,
    });
    yield* ui.log.info(`Loaded ${projects.data.length} projects`);

    if (projects.data.length === 0) {
      yield* ui.log.warn(`No projects found for org "${selectedOrganization.name}".`);
      return undefined;
    }

    const selectedProject = yield* selectProject(projects.data, explicitProjectId);

    if (!selectedProject) {
      yield* ui.log.warn('No project selected.');
      return undefined;
    }
    yield* ui.log.info(`Selected project: "${selectedProject.name}" (${selectedProject.id})`);

    return { org: selectedOrganization, project: selectedProject } as const;
  });
