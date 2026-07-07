import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';

const triggerName = Args.text({ name: 'trigger-name' }).pipe(
  Args.withDescription('Trigger slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE")'),
  Args.optional
);

const connectedAccountId = Options.text('connected-account-id').pipe(
  Options.withDescription('Connected account ID (nanoid)'),
  Options.optional
);

const triggerConfig = Options.text('trigger-config').pipe(
  Options.withDescription('Trigger config as JSON string'),
  Options.optional
);

const ifMissing = Options.boolean('if-missing').pipe(
  Options.withDefault(false),
  Options.withDescription(
    'Skip creation when an active instance of this trigger type already exists (idempotent setup)'
  )
);

/**
 * Create a trigger instance.
 */
export const triggersCmd$Create = Command.make(
  'create',
  { triggerName, connectedAccountId, triggerConfig, ifMissing },
  ({ triggerName, connectedAccountId, triggerConfig, ifMissing }) =>
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
        try {
          const parsed: unknown = JSON.parse(triggerConfig.value);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            yield* ui.log.error(
              '--trigger-config must be a JSON object (e.g. \'{"key":"value"}\').'
            );
            return;
          }
          parsedTriggerConfig = parsed as Record<string, unknown>;
        } catch {
          yield* ui.log.error('Invalid JSON in --trigger-config. Please provide valid JSON.');
          yield* ui.log.step(
            'Example:\n> composio dev triggers create "GMAIL_NEW_GMAIL_MESSAGE" --trigger-config \'{"label":"inbox"}\''
          );
          return;
        }
      }

      if (ifMissing) {
        // Re-runnable setup scripts must not mint duplicate instances —
        // duplicates mean duplicate webhook deliveries.
        const existing = yield* repo
          .listActiveTriggers({
            trigger_names: [triggerName.value],
            show_disabled: false,
            limit: 1,
          })
          .pipe(
            Effect.asSome,
            Effect.catchTag(
              'services/HttpServerError',
              handleHttpServerError(ui, {
                fallbackMessage: 'Failed to check for existing trigger instances.',
                hint: 'Retry without --if-missing, or list instances with:\n> composio dev triggers status',
                fallbackValue: Option.none(),
              })
            )
          );
        if (Option.isNone(existing)) {
          return;
        }
        const existingItems = existing.value.items ?? [];
        if (existingItems.length > 0) {
          yield* ui.log.success(
            `Trigger "${triggerName.value}" already active - skipping (--if-missing)`
          );
          yield* ui.output(JSON.stringify(existingItems[0], null, 2));
          return;
        }
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
