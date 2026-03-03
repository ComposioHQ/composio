import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  listOrganizationProjects,
  listOrganizations,
  type OrganizationSummary,
  type OrganizationProjectSummary,
} from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { clampLimit } from 'src/ui/clamp-limit';

const orgId = Options.text('org-id').pipe(
  Options.optional,
  Options.withDescription('Organization ID to use as global default')
);

const projectId = Options.text('project-id').pipe(
  Options.optional,
  Options.withDescription('Project ID to use as global default')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(50),
  Options.withDescription('Max org/projects to fetch from API (default: 50)')
);

const selectOrganization = (params: {
  organizations: ReadonlyArray<OrganizationSummary>;
  selectedOrgId?: string;
}) =>
  Effect.gen(function* () {
    const { organizations, selectedOrgId } = params;
    const ui = yield* TerminalUI;
    if (organizations.length === 0) return undefined;

    if (selectedOrgId) {
      const explicitMatch = organizations.find(org => org.id === selectedOrgId);
      if (explicitMatch) return explicitMatch;
    }

    if (organizations.length === 1) return organizations[0];

    return yield* ui.select('Select a default organization (global scope):', [
      ...organizations.map(org => ({
        value: org,
        label: org.name,
        hint: org.id,
      })),
    ]);
  });

const selectProject = (params: {
  projects: ReadonlyArray<OrganizationProjectSummary>;
  selectedProjectId?: string;
}) =>
  Effect.gen(function* () {
    const { projects, selectedProjectId } = params;
    const ui = yield* TerminalUI;
    if (projects.length === 0) return undefined;

    if (selectedProjectId) {
      const explicitMatch = projects.find(project => project.id === selectedProjectId);
      if (explicitMatch) return explicitMatch;
    }

    if (projects.length === 1) return projects[0];

    return yield* ui.select('Select a default project (global scope):', [
      ...projects.map(project => ({
        value: project,
        label: project.name,
        hint: project.id,
      })),
    ]);
  });

export const orgsCmd$Switch = Command.make(
  'switch',
  { orgId, projectId, limit },
  ({ orgId, projectId, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;
      yield* ui.intro('composio orgs switch');

      const apiKey = Option.getOrUndefined(ctx.data.apiKey);
      if (!apiKey) {
        yield* ui.log.warn('No user API key found. Run `composio login` first.');
        yield* ui.outro('');
        return;
      }

      const clampedLimit = clampLimit(limit);
      const explicitOrgId = Option.getOrUndefined(orgId);
      const explicitProjectId = Option.getOrUndefined(projectId);

      yield* ui.note(
        'This updates your default global org/project context for CLI commands. Use `composio init` for per-project local overrides.',
        'Global defaults'
      );

      const selectedOrganization =
        explicitOrgId !== undefined
          ? ({ id: explicitOrgId, name: explicitOrgId } satisfies OrganizationSummary)
          : yield* Effect.gen(function* () {
              const organizations = yield* listOrganizations({
                baseURL: ctx.data.baseURL,
                apiKey,
                limit: clampedLimit,
              });
              yield* ui.log.info(`Loaded ${organizations.data.length} orgs`);
              return organizations;
            }).pipe(
              Effect.flatMap(organizations =>
                Effect.gen(function* () {
                  if (organizations.data.length === 0) {
                    return undefined;
                  }
                  return yield* selectOrganization({
                    organizations: organizations.data,
                    selectedOrgId: explicitOrgId,
                  });
                })
              )
            );

      if (!selectedOrganization) {
        yield* ui.log.warn('No organizations found for this API key.');
        yield* ui.outro('No org selected.');
        return;
      }
      yield* ui.log.info(
        `Selected organization: "${selectedOrganization.name}" (${selectedOrganization.id})`
      );

      const projects = yield* listOrganizationProjects({
        baseURL: ctx.data.baseURL,
        apiKey,
        orgId: selectedOrganization.id,
        limit: clampedLimit,
      });
      yield* ui.log.info(`Loaded ${projects.data.length} projects`);

      if (projects.data.length === 0) {
        yield* ui.log.warn(`No projects found for org "${selectedOrganization.name}".`);
        yield* ui.outro('No projects available.');
        return;
      }

      const selectedProject = yield* selectProject({
        projects: projects.data,
        selectedProjectId: explicitProjectId,
      });

      if (!selectedProject) {
        yield* ui.log.warn('No project selected.');
        yield* ui.outro('No project selected.');
        return;
      }
      yield* ui.log.info(`Selected project: "${selectedProject.name}" (${selectedProject.id})`);

      yield* ctx.login(
        apiKey,
        selectedOrganization.id,
        selectedProject.id,
        Option.getOrUndefined(ctx.data.testUserId)
      );

      yield* ui.log.success(
        `Updated global defaults to "${selectedOrganization.name}" / "${selectedProject.name}".`
      );
      yield* ui.output(
        JSON.stringify({
          scope: 'global',
          org_id: selectedOrganization.id,
          project_id: selectedProject.id,
        })
      );
      yield* ui.outro('Global org/project defaults updated.');
    })
).pipe(Command.withDescription('Switch default global organization/project context.'));
