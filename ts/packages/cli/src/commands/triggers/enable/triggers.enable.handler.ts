import { Effect, Option } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { resolveDeveloperResourceProject } from 'src/commands/surface';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { TerminalUI } from 'src/services/terminal-ui';

export type TriggersEnableParams = {
  readonly id: Option.Option<string>;
};

const invalidInput = commandInputError('dev triggers enable');

/**
 * Enable an existing trigger instance of the developer project. A missing `<id>` fails with a
 * `CommandInputError` before any request, and a developer project that cannot be found with
 * `ProjectResolutionError`; an API failure is reported with a hint and exits 1.
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
      return yield* invalidInput(
        'Missing required argument: <id>\nTry specifying a trigger ID, e.g.:\n> composio dev triggers enable "trg_123"\n\nTo find trigger IDs:\n> composio dev triggers status --show-disabled',
        '<id>'
      );
    }

    const idValue = id.value;
    const project = yield* resolveDeveloperResourceProject;
    yield* ui
      .withSpinner(`Enabling trigger "${idValue}"...`, repo.enableTrigger(project, idValue))
      .pipe(
        Effect.catchTag(
          CLIENT_API_ERROR_TAGS,
          handleClientApiError(ui, {
            fallbackMessage: `Failed to enable trigger "${idValue}".`,
            hint: 'Browse available triggers:\n> composio dev triggers status --show-disabled',
          })
        )
      );

    yield* ui.log.success(`Trigger "${idValue}" enabled.`);
  });
