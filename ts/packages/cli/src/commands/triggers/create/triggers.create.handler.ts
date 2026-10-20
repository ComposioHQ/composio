import { Effect, Match, Option, Result } from 'effect';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { TerminalUI } from 'src/services/terminal-ui';
import { parseJsonRecord, type JsonParsingError } from 'src/utils/parse-json';

export type TriggersCreateParams = {
  readonly triggerName: Option.Option<string>;
  readonly connectedAccountId: Option.Option<string>;
  readonly triggerConfig: Option.Option<string>;
};

/** `--trigger-config` as a record, `undefined` when the flag is absent. */
const parseTriggerConfig = (triggerConfig: Option.Option<string>) =>
  Option.match(triggerConfig, {
    onNone: () => Result.succeed(undefined),
    onSome: parseJsonRecord,
  });

const reportInvalidTriggerConfig = (ui: TerminalUI, error: JsonParsingError) =>
  Match.value(error.reason).pipe(
    Match.when('not-a-record', () =>
      ui.log.error('--trigger-config must be a JSON object (e.g. \'{"key":"value"}\').')
    ),
    Match.when('syntax', () =>
      Effect.andThen(
        ui.log.error('Invalid JSON in --trigger-config. Please provide valid JSON.'),
        ui.log.step(
          'Example:\n> composio dev triggers create "GMAIL_NEW_GMAIL_MESSAGE" --trigger-config \'{"label":"inbox"}\''
        )
      )
    ),
    Match.exhaustive
  );

/**
 * Create a trigger instance.
 *
 * @example
 * ```bash
 * composio dev triggers create "GMAIL_NEW_GMAIL_MESSAGE" --connected-account-id "con_123"
 * ```
 */
export const runTriggersCreate = ({
  triggerName,
  connectedAccountId,
  triggerConfig,
}: TriggersCreateParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    if (Option.isNone(triggerName)) {
      yield* ui.log.warn('Missing required argument: <trigger-name>');
      yield* ui.log.step(
        'Try specifying a trigger slug, e.g.:\n> composio dev triggers create "GMAIL_NEW_GMAIL_MESSAGE" --connected-account-id "con_123"'
      );
      return;
    }

    const parsedTriggerConfig = parseTriggerConfig(triggerConfig);
    if (Result.isFailure(parsedTriggerConfig)) {
      yield* reportInvalidTriggerConfig(ui, parsedTriggerConfig.failure);
      return;
    }

    const createdOpt = yield* ui
      .withSpinner(
        `Creating trigger "${triggerName.value}"...`,
        repo.createTrigger(triggerName.value, {
          connected_account_id: Option.getOrUndefined(connectedAccountId),
          trigger_config: parsedTriggerConfig.success,
        })
      )
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          CLIENT_API_ERROR_TAGS,
          handleClientApiError(ui, {
            fallbackMessage: `Failed to create trigger "${triggerName.value}".`,
            hint: 'List available trigger types with:\n> composio dev triggers list',
            fallbackValue: Option.none(),
          })
        )
      );

    if (Option.isNone(createdOpt)) {
      return;
    }

    const created = createdOpt.value;
    yield* ui.log.success(`Trigger created: ${created.trigger_id}`);
    yield* ui.log.step(
      `To check status:\n> composio dev triggers status --trigger-ids "${created.trigger_id}"`
    );
    yield* ui.output(JSON.stringify(created, null, 2));
  });
