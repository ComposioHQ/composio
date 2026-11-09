import { Effect, Option } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { TerminalUI } from 'src/services/terminal-ui';

export type TriggersDisableParams = {
  readonly id: Option.Option<string>;
  readonly dangerouslyAllow: boolean;
};

const invalidInput = commandInputError('dev triggers disable');

/**
 * Disable an existing trigger instance. A developer-destructive command: it runs only when
 * `developer.destructive_actions` is enabled and `--dangerously-allow` is passed. A missing `<id>`
 * fails with a `CommandInputError` before any request; an API failure is reported with a hint and
 * exits 1.
 *
 * @example
 * ```bash
 * composio dev triggers disable "trg_123" --dangerously-allow
 * ```
 */
export const runTriggersDisable = ({ id, dangerouslyAllow }: TriggersDisableParams) =>
  Effect.gen(function* () {
    const config = yield* ComposioCliUserConfig;
    if (!config.areDeveloperDangerousCommandsEnabled()) {
      return yield* invalidInput(
        'This developer command is disabled by config. Set developer.destructive_actions to true in ~/.composio/config.json to allow it.'
      );
    }
    if (!dangerouslyAllow) {
      return yield* invalidInput(
        'This developer command requires explicit acknowledgement. Re-run with --dangerously-allow.',
        '--dangerously-allow'
      );
    }
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    if (Option.isNone(id)) {
      return yield* invalidInput(
        'Missing required argument: <id>\nTry specifying a trigger ID, e.g.:\n> composio dev triggers disable "trg_123"\n\nTo find trigger IDs:\n> composio dev triggers status',
        '<id>'
      );
    }

    const idValue = id.value;
    yield* ui.withSpinner(`Disabling trigger "${idValue}"...`, repo.disableTrigger(idValue)).pipe(
      Effect.catchTag(
        CLIENT_API_ERROR_TAGS,
        handleClientApiError(ui, {
          fallbackMessage: `Failed to disable trigger "${idValue}".`,
          hint: 'Browse available triggers:\n> composio dev triggers status',
        })
      )
    );

    yield* ui.log.success(`Trigger "${idValue}" disabled.`);
  });
