import { Effect } from 'effect';
import { reportFailure } from 'src/effects/report-failure';
import { AgentAuthError } from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

/** Reports an `AgentAuthError` and its next steps on stderr and exits 1. */
export const handleAgentAuthError = <E, R>(effect: Effect.Effect<void, E | AgentAuthError, R>) =>
  effect.pipe(
    Effect.catchIf(
      (error): error is AgentAuthError => error instanceof AgentAuthError,
      error =>
        Effect.gen(function* () {
          const ui = yield* TerminalUI;
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
