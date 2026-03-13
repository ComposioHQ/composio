import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { runOrgProjectSelection } from 'src/effects/select-org-project';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';

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

      yield* ui.note(
        'This updates your default global org/project context for CLI commands. Use `composio init` for per-project local overrides.',
        'Global defaults'
      );

      const result = yield* runOrgProjectSelection({
        apiKey,
        baseURL: ctx.data.baseURL,
        explicitOrgId: Option.getOrUndefined(orgId),
        explicitProjectId: Option.getOrUndefined(projectId),
        limit,
      });

      if (!result) {
        yield* ui.outro('No org selected.');
        return;
      }

      const { org: selectedOrganization, project: selectedProject } = result;

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
