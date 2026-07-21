import { Argument, Command, Flag } from 'effect/unstable/cli';
import { Effect, Option, Result } from 'effect';
import { parseJsonRecord } from 'src/utils/parse-json';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';

const triggerName = Argument.string('trigger-name').pipe(
  Argument.withDescription('Trigger slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE")'),
  Argument.optional
);

const connectedAccountId = Flag.string('connected-account-id').pipe(
  Flag.withDescription('Connected account ID (nanoid)'),
  Flag.optional
);

const triggerConfig = Flag.string('trigger-config').pipe(
  Flag.withDescription('Trigger config as JSON string'),
  Flag.optional
);

/**
 * Create a trigger instance.
 */
export const triggersCmd$Create = Command.make(
  'create',
  { triggerName, connectedAccountId, triggerConfig },
  ({ triggerName, connectedAccountId, triggerConfig }) =>
    Effect.gen(function* () {
      if (!(yield* requireAuth)) return;

      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;

      if (Option.isNone(triggerName)) {
        yield* ui.log.warn('Missing required argument: <trigger-name>');
        yield* ui.log.step(
          'Try specifying a trigger slug, e.g.:\n> composio dev triggers create "GMAIL_NEW_GMAIL_MESSAGE" --connected-account-id "con_123"'
        );
        return;
      }

      let parsedTriggerConfig: Record<string, unknown> | undefined;
      if (Option.isSome(triggerConfig)) {
        const parsed = parseJsonRecord(triggerConfig.value);
        if (Result.isFailure(parsed)) {
          if (parsed.failure.reason === 'not-a-record') {
            yield* ui.log.error(
              '--trigger-config must be a JSON object (e.g. \'{"key":"value"}\').'
            );
          } else {
            yield* ui.log.error('Invalid JSON in --trigger-config. Please provide valid JSON.');
            yield* ui.log.step(
              'Example:\n> composio dev triggers create "GMAIL_NEW_GMAIL_MESSAGE" --trigger-config \'{"label":"inbox"}\''
            );
          }
          return;
        }
        parsedTriggerConfig = parsed.success;
      }

      const createdOpt = yield* ui
        .withSpinner(
          `Creating trigger "${triggerName.value}"...`,
          repo.createTrigger(triggerName.value, {
            connected_account_id: Option.getOrUndefined(connectedAccountId),
            trigger_config: parsedTriggerConfig,
          })
        )
        .pipe(
          Effect.asSome,
          Effect.catchTag(
            'services/HttpServerError',
            handleHttpServerError(ui, {
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
    })
).pipe(Command.withDescription('Create a new trigger instance.'));
