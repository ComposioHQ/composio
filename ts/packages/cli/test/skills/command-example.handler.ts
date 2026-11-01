import { Effect, Option } from 'effect';
import { actingUser } from 'src/commands/surface';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { idempotent } from 'src/services/composio-request';
import { TerminalUI } from 'src/services/terminal-ui';

export type ListParams = { readonly toolkit: Option.Option<string> };

/** Teaching example: lists accounts through the CLI's native Effect client. */
export const listAccounts = ({ toolkit }: ListParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const factory = yield* ComposioClientSingleton;
    const { userId, project } = yield* actingUser();
    const client = yield* factory.getFor({ orgId: project.orgId, projectId: project.projectId });
    const result = yield* client.connectedAccounts.list(
      {
        user_ids: [userId],
        toolkit_slugs: Option.map(toolkit, slug => [slug]).pipe(Option.getOrUndefined),
      },
      idempotent
    );
    yield* ui.output(JSON.stringify(result.items), { force: true });
  });
