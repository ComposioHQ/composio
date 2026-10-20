import { Effect, Option } from 'effect';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { TerminalUI } from 'src/services/terminal-ui';

export type TriggersEnableParams = {
  readonly id: Option.Option<string>;
};

/**
 * Enable an existing trigger instance.
 *
 * @example
 * ```bash
 * composio dev triggers enable "trg_123"
 * ```
 */
export const runTriggersEnable = ({ id }: TriggersEnableParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    if (Option.isNone(id)) {
      yield* ui.log.warn('Missing required argument: <id>');
      yield* ui.log.step(
        'Try specifying a trigger ID, e.g.:\n> composio dev triggers enable "trg_123"\n\nTo find trigger IDs:\n> composio dev triggers status --show-disabled'
      );
      return;
    }

    const idValue = id.value;
    const enabled = yield* ui
      .withSpinner(`Enabling trigger "${idValue}"...`, repo.enableTrigger(idValue))
      .pipe(
        Effect.as(true),
        Effect.catchTag(
          CLIENT_API_ERROR_TAGS,
          handleClientApiError(ui, {
            fallbackMessage: `Failed to enable trigger "${idValue}".`,
            hint: 'Browse available triggers:\n> composio dev triggers status --show-disabled',
            fallbackValue: false,
          })
        )
      );

    if (!enabled) return;

    yield* ui.log.success(`Trigger "${idValue}" enabled.`);
  });
