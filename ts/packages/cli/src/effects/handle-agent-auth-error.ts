import { Effect } from 'effect';
import { reportFailure } from 'src/effects/report-failure';
import { AgentAuthError, AgentRequestError, isAgentGatewayError } from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

export const handleAgentAuthError = <E, R>(
  effect: Effect.Effect<void, E | AgentAuthError | AgentRequestError, R>
) =>
  effect.pipe(
    Effect.catchIf(
      error => error instanceof AgentAuthError || isAgentGatewayError(error),
      error =>
        Effect.gen(function* () {
          const ui = yield* TerminalUI;
          if (error instanceof AgentRequestError) {
            const unavailable = 'Agent signup is unavailable right now.';
            const message = error.pathname.startsWith('/api/signup')
              ? unavailable
              : `The agent identity service returned HTTP ${error.status} for ${error.pathname}. ${unavailable}`;
            return yield* reportFailure(
              ui,
              message,
              'Ask a human to run `composio login` for regular CLI access.'
            );
          }

          return yield* reportFailure(
            ui,
            error.message,
            error.nextSteps.length > 0
              ? ['Next steps:', ...error.nextSteps.map((step: string) => `- ${step}`)].join('\n')
              : undefined
          );
        })
    )
  );
