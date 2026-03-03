import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import {
  listOrganizationProjects,
  type OrganizationProjectSummary,
} from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { clampLimit } from 'src/ui/clamp-limit';

const orgId = Options.text('org-id').pipe(
  Options.optional,
  Options.withDescription('Organization ID to use while switching project')
);

const projectId = Options.text('project-id').pipe(
  Options.optional,
  Options.withDescription('Project ID to use as global default')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(50),
  Options.withDescription('Max projects to fetch from API (default: 50)')
);

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

export const projectsCmd$Switch = Command.make(
  'switch',
  { orgId, projectId, limit },
  ({ orgId, projectId, limit }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;
      yield* ui.intro('composio projects switch');

      const apiKey = Option.getOrUndefined(ctx.data.apiKey);
      if (!apiKey) {
        yield* ui.log.warn('No user API key found. Run `composio login` first.');
        yield* ui.outro('');
        return;
      }

      const resolvedOrgId = Option.getOrUndefined(orgId) ?? Option.getOrUndefined(ctx.data.orgId);
      if (!resolvedOrgId) {
        yield* ui.log.warn('No default org is configured.');
        yield* ui.log.info('Run `composio orgs switch` to select org and project globally.');
        yield* ui.outro('');
        return;
      }

      const clampedLimit = clampLimit(limit);
      const explicitProjectId = Option.getOrUndefined(projectId);

      yield* ui.note(
        'This updates your default global project context. To switch organization, use `composio orgs switch`.',
        'Global defaults'
      );
      yield* ui.log.info(`Using organization: ${resolvedOrgId}`);

      const projects = yield* listOrganizationProjects({
        baseURL: ctx.data.baseURL,
        apiKey,
        orgId: resolvedOrgId,
        limit: clampedLimit,
      });
      yield* ui.log.info(`Loaded ${projects.data.length} projects`);

      if (projects.data.length === 0) {
        yield* ui.log.warn('No projects found for the selected org.');
        yield* ui.log.info('Use `composio orgs switch` to switch to another organization.');
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
        resolvedOrgId,
        selectedProject.id,
        Option.getOrUndefined(ctx.data.testUserId)
      );

      yield* ui.log.success(`Updated global default project to "${selectedProject.name}".`);
      yield* ui.log.info('To switch organization as well, run `composio orgs switch`.');
      yield* ui.output(
        JSON.stringify({
          scope: 'global',
          org_id: resolvedOrgId,
          project_id: selectedProject.id,
        })
      );
      yield* ui.outro('Global project default updated.');
    })
).pipe(Command.withDescription('Switch default global project context.'));
