# A checked command-authoring example

The example declares an optional toolkit filter, resolves the acting user, sends a scoped native Effect request, and writes JSON. It is a teaching command, not the production connection renderer. The production handler also decodes responses and computes permission groups.

The declaration and handler below are compiled by the CLI's test typecheck. The example test substitutes this declaration for `connections list`, so argv enters the real command tree and `runInvocation` over `TestLive`.

## Declaration

```ts no-check repo-file=ts/packages/cli/test/skills/command-example.cmd.ts
import { Command, Flag } from 'effect/cli';
import { withCommandMeta } from 'src/invocation/command-identity';
import { listAccounts } from './command-example.handler';

const toolkit = Flag.String('toolkit').pipe(
  Flag.withDescription('Filter by toolkit slug'),
  Flag.optional
);

/** Teaching example, substituted for connections list only by its test. */
export const connectionsCmd$List = Command.make('list', { toolkit }, listAccounts).pipe(
  Command.withDescription('List connected accounts.'),
  withCommandMeta({ requiresLogin: true })
);
```

## Handler

```ts no-check repo-file=ts/packages/cli/test/skills/command-example.handler.ts
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
```

`ComposioClientSingleton` constructs clients from `@composio/client/effect`. The handler yields a native client operation directly. Its test replaces the connected-account resource's HTTP transport with the existing recording transport. The test records scope arguments separately because its fixed recording client does not prove scoped request headers. It does not replace the resource operation with a function that returns a canned Effect.

## What the checks establish

The root command `bun run validate:cli-skills` runs in Agent Substrate CI. It checks that linked excerpts still match source, compiles standalone Effect examples and the CLI tests, exercises the example, runs existing registration and invocation contracts, and checks Effect diagnostics.

The example asserts the organization and project passed to `getFor`, optional-filter request mapping, the acting user, JSON stdout, empty stderr, inherited login enforcement, help/version handling, parse failures, skipped hooks, and lifecycle identity. Existing registration and command-identity tests cover nested providers, reused registrations, root/dev command paths, shared flags, and canonical paths after a rejected command token.

These checks certify the recipe and the selected contracts at the tested revision. They do not certify arbitrary prose claims, live backend behavior, or an agent's ability to apply the skill to an unfamiliar request. The routing checks measure description matching, not skill use. Known telemetry defects from the architecture review remain separate fixes.

## Evaluate actual skill use

A separate authoring trial measures whether an agent can use the guidance. The trial starts from a fresh worktree and gives the agent the CLI and Effect skills plus a new task. The evaluator keeps its request assertions out of the agent's starting context.

An example task asks for an optional `--limit` on the teaching command. When absent, the command must preserve the existing request. When present, it must send the parsed integer as the request limit. The agent must keep login enforcement, output streams, and lifecycle reporting intact.

The evaluator checks both argv forms against the recorded HTTP request, then runs `bun run validate:cli-skills`. The evaluation records the starting revision, prompt, produced diff, and check results. The task is a template for an unseen trial, not a claim that such a trial has run. Reusing a published solution does not establish performance on an unseen task.
