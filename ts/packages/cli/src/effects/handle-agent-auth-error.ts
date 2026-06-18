import process from 'node:process';
import { Effect } from 'effect';
import { AgentAuthError } from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';

export const handleAgentAuthError = <E, R>(effect: Effect.Effect<void, E | AgentAuthError, R>) =>
  effect.pipe(
    Effect.catchIf(
      (error): error is AgentAuthError => error instanceof AgentAuthError,
      error =>
        Effect.gen(function* () {
          const ui = yield* TerminalUI;
          yield* ui.log.warn(error.message);
          if (error.nextSteps.length > 0) {
            yield* ui.log.info(
              ['Next steps:', ...error.nextSteps.map((step: string) => `- ${step}`)].join('\n')
            );
          }
          yield* Effect.sync(() => {
            process.exitCode = 1;
          });
        })
    )
  );
