import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import { listOrganizationProjects } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { clampLimit } from 'src/ui/clamp-limit';

const orgId = Options.text('org-id').pipe(
  Options.optional,
  Options.withDescription('Organization ID to list projects for (defaults to current global org)')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(50),
  Options.withDescription('Max projects to fetch from API (default: 50)')
);

export const projectsCmd$List = Command.make('list', { orgId, limit }, ({ orgId, limit }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    yield* ui.intro('composio manage projects list');
    const apiKey = Option.getOrUndefined(ctx.data.apiKey);
    if (!apiKey) {
      yield* ui.log.warn('No user API key found. Run `composio login` first.');
      return;
    }

    const resolvedOrgId = Option.getOrUndefined(orgId) ?? Option.getOrUndefined(ctx.data.orgId);
    if (!resolvedOrgId) {
      yield* ui.log.warn('No default org is configured.');
      yield* ui.outro('Hint: run `composio manage orgs switch` first, or pass `--org-id`.');
      return;
    }

    const clampedLimit = clampLimit(limit);
    const projects = yield* ui.withSpinner(
      'Loading projects...',
      listOrganizationProjects({
        baseURL: ctx.data.baseURL,
        apiKey,
        orgId: resolvedOrgId,
        limit: clampedLimit,
      }),
      {
        successMessage: result => `Loaded ${result.data.length} projects`,
        errorMessage: 'Failed to fetch projects',
      }
    );

    if (projects.data.length === 0) {
      yield* ui.log.warn('No projects found.');
      yield* ui.outro(
        'Hint: run `composio dev init` in a directory to bind it to a developer project.'
      );
      return;
    }

    const lines = projects.data.map(project => {
      return `  ${project.name} (${project.id})`;
    });
    yield* ui.log.step(lines.join('\n'));
    yield* ui.outro(
      [
        'Hint: run `composio dev init` in a directory to bind it to a developer project.',
        'Run `composio manage orgs switch` to change your default org.',
      ].join('\n')
    );

    yield* ui.output(
      JSON.stringify(
        projects.data.map(project => ({
          id: project.id,
          name: project.name,
          is_selected_global_project: false,
        }))
      )
    );
  })
).pipe(Command.withDescription('List developer projects for the current organization.'));
