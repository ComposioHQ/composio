import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { TerminalUI } from 'src/services/terminal-ui';
import { listOrganizations } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { clampLimit } from 'src/ui/clamp-limit';

const limit = Options.integer('limit').pipe(
  Options.withDefault(50),
  Options.withDescription('Max organizations to fetch from API (default: 50)')
);

export const orgsCmd$List = Command.make('list', { limit }, ({ limit }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const apiKey = Option.getOrUndefined(ctx.data.apiKey);
    if (!apiKey) {
      yield* ui.log.warn('No user API key found. Run `composio login` first.');
      return;
    }

    const clampedLimit = clampLimit(limit);
    const defaultOrgId = Option.getOrUndefined(ctx.data.orgId);

    yield* ui.intro(`composio dev orgs list`);

    const organizations = yield* ui.withSpinner(
      'Loading organizations...',
      listOrganizations({
        baseURL: ctx.data.baseURL,
        apiKey,
        limit: clampedLimit,
      }),
      {
        successMessage: result => `Loaded ${result.data.length} orgs`,
        errorMessage: 'Failed to fetch organizations',
      }
    );

    if (organizations.data.length === 0) {
      yield* ui.log.warn('No organizations found.');
      return;
    }

    const lines = organizations.data.map(org => {
      const isSelected = defaultOrgId === org.id;
      return `${isSelected ? '✓' : ' '} ${org.name} (${org.id})`;
    });
    yield* ui.log.info(lines.join('\n'));
    yield* ui.outro(
      'Hint: run `composio dev orgs switch` to switch the default global org/project.'
    );

    yield* ui.output(
      JSON.stringify(
        organizations.data.map(org => ({
          id: org.id,
          name: org.name,
          is_selected_global_org: defaultOrgId === org.id,
        }))
      )
    );
  })
).pipe(Command.withDescription('List organizations and show current global selection.'));
