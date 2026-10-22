import { Effect, Match, Option, Result } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { CommandSurface } from 'src/commands/surface';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { ProjectContext } from 'src/services/project-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
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

const invalidInput = commandInputError('dev triggers create');

/** The usage error for a `--trigger-config` that is not valid JSON or not a JSON object. */
const invalidTriggerConfig = (error: JsonParsingError) =>
  invalidInput(
    Match.value(error.reason).pipe(
      Match.when(
        'not-a-record',
        () => '--trigger-config must be a JSON object (e.g. \'{"key":"value"}\').'
      ),
      Match.when(
        'syntax',
        () =>
          'Invalid JSON in --trigger-config. Please provide valid JSON.\nExample:\n> composio dev triggers create "GMAIL_NEW_GMAIL_MESSAGE" --trigger-config \'{"label":"inbox"}\''
      ),
      Match.exhaustive
    ),
    '--trigger-config'
  );

/**
 * Create a trigger instance as the `dev` group's `--user-id`, else the directory project's test
 * user, else the global test user; without any, the request omits `user_id`. A missing `<trigger-name>` or an invalid `--trigger-config` fails
 * with a `CommandInputError` before any request; an API failure is reported with a hint and
 * exits 1.
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
    const { userId } = yield* CommandSurface;
    const projectContext = yield* ProjectContext;
    const userContext = yield* ComposioUserContext;

    if (Option.isNone(triggerName)) {
      return yield* invalidInput(
        'Missing required argument: <trigger-name>\nTry specifying a trigger slug, e.g.:\n> composio dev triggers create "GMAIL_NEW_GMAIL_MESSAGE" --connected-account-id "con_123"',
        '<trigger-name>'
      );
    }

    const parsedTriggerConfig = parseTriggerConfig(triggerConfig);
    if (Result.isFailure(parsedTriggerConfig)) {
      return yield* invalidTriggerConfig(parsedTriggerConfig.failure);
    }

    const project = yield* projectContext.resolve;
    const projectTestUserId = Option.flatMap(project, keys => keys.testUserId);
    const globalTestUserId = userContext.data.testUserId;
    const resolvedUserId = userId.pipe(
      Option.orElse(() => projectTestUserId),
      Option.orElse(() => globalTestUserId)
    );

    // A defaulted user id must own the connected account on a 2FA project, so name it.
    if (Option.isNone(userId) && Option.isSome(projectTestUserId)) {
      yield* ui.log.warn(`Using test user id "${projectTestUserId.value}"`);
    } else if (Option.isNone(userId) && Option.isSome(globalTestUserId)) {
      yield* ui.log.warn(`Using global test user id "${globalTestUserId.value}"`);
    }

    const createdOpt = yield* ui
      .withSpinner(
        `Creating trigger "${triggerName.value}"...`,
        repo.createTrigger(triggerName.value, {
          connected_account_id: Option.getOrUndefined(connectedAccountId),
          trigger_config: parsedTriggerConfig.success,
          user_id: Option.getOrUndefined(resolvedUserId),
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
