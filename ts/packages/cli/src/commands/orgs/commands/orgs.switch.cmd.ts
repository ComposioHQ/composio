import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { runOrgSelection } from 'src/effects/select-org-project';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';

const orgId = Options.text('org-id').pipe(
  Options.optional,
  Options.withDescription('Organization ID to use as global default')
);

const limit = Options.integer('limit').pipe(
  Options.withDefault(50),
  Options.withDescription('Max orgs to fetch from API (default: 50)')
);

export const orgsCmd$Switch = Command.make('switch', { orgId, limit }, ({ orgId, limit }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    yield* ui.intro('composio manage orgs switch');

    const apiKey = Option.getOrUndefined(ctx.data.apiKey);
    if (!apiKey) {
      yield* ui.log.warn('No user API key found. Run `composio login` first.');
      yield* ui.outro('');
      return;
    }

    yield* ui.note(
      'This updates your default org for CLI commands. Use `composio init` for local developer project setup.',
      'Global defaults'
    );

    const result = yield* runOrgSelection({
      apiKey,
      baseURL: ctx.data.baseURL,
      explicitOrgId: Option.getOrUndefined(orgId),
      limit,
    });

    if (!result) {
      yield* ui.outro('No org selected.');
      return;
    }

    yield* ctx.login(apiKey, result.id, Option.getOrUndefined(ctx.data.testUserId));

    yield* ui.log.success(`Updated default org to "${result.name}".`);
    yield* ui.output(
      JSON.stringify({
        scope: 'global',
        org_id: result.id,
      })
    );
    yield* ui.outro('Default org updated.');
  })
).pipe(Command.withDescription('Switch default organization context.'));
