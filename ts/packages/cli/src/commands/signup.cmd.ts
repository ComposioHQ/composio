import { Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import { handleAgentAuthError } from 'src/effects/handle-agent-auth-error';
import {
  ensureAgentSignupAllowed,
  getOrSignupReadyAgent,
  loginWithAgentIdentity,
  safeAgentSummary,
  signupAgent,
} from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

const noWait = Options.boolean('no-wait').pipe(
  Options.withDefault(false),
  Options.withDescription('Start agent signup and exit without waiting for credentials')
);

const noLogin = Options.boolean('no-login').pipe(
  Options.withDefault(false),
  Options.withDescription('Create or verify the agent identity without logging the CLI in')
);

const force = Options.boolean('force').pipe(
  Options.withAlias('f'),
  Options.withDefault(false),
  Options.withDescription(
    'Create a new agent identity even if ~/.composio/agent.json already exists'
  )
);

export const runAgentSignup = (params: {
  noWait: boolean;
  noLogin: boolean;
  force: boolean;
  commandLabel?: string;
}) =>
  handleAgentAuthError(
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const commandLabel = params.commandLabel ?? 'composio signup';

      yield* ensureAgentSignupAllowed;
      yield* ui.intro(commandLabel);
      yield* ui.log.info(
        `${commandLabel} signs you up as a Composio agent. This flow is fully non-interactive and does not open a browser.`
      );

      const identity = yield* params.noWait
        ? signupAgent({ wait: false })
        : getOrSignupReadyAgent({ force: params.force });
      const summary = safeAgentSummary(identity);

      yield* ui.note(
        [
          `Type: agent`,
          `Status: ${summary.status}`,
          `Email: ${summary.email ?? 'unknown'}`,
          `Slug: ${summary.slug ?? 'unknown'}`,
          `Default Org ID: ${summary.org_id ?? 'pending'}`,
          `Project ID: ${summary.project_id ?? 'pending'}`,
          `Agent key: stored in ~/.composio/agent.json`,
        ].join('\n'),
        'Composio Agent'
      );

      if (!params.noWait && !params.noLogin) {
        yield* loginWithAgentIdentity(identity);
        yield* ui.log.success('Logged in with the Composio agent identity.');
      } else if (params.noWait) {
        yield* ui.log.info('Signup is pending. Run `composio agent whoami` to poll status.');
      }

      yield* ui.output(
        JSON.stringify({ ...summary, logged_in: !params.noWait && !params.noLogin })
      );
      yield* ui.outro('Agent setup complete.');
    })
  );

export const signupCmd = Command.make(
  'signup',
  { noWait, noLogin, force },
  ({ noWait, noLogin, force }) => runAgentSignup({ noWait, noLogin, force })
).pipe(Command.withDescription('Sign up and optionally log in as a Composio agent.'));
