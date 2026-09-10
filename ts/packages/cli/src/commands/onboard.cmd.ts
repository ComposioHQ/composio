import type { Composio as RawComposioClient } from '@composio/client';
import { Command, Options } from '@effect/cli';
import { Clock, Data, Effect, Match, Option } from 'effect';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import {
  CLI_ONBOARDING_EVENTS,
  getCliOnboardingEvent,
  type CliOnboardingEventName,
} from 'src/analytics/events';
import { browserLogin } from 'src/commands/login.cmd';
import { linkRootConsumerToolkit } from 'src/commands/connected-accounts/commands/connected-accounts.link.cmd';
import { APP_VERSION } from 'src/constants';
import { decodeConnectedAccountItems } from 'src/effects/decode-connected-account-list';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
  type ResolvedCommandProject,
} from 'src/services/command-project';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { NodeOs } from 'src/services/node-os';
import {
  findCuratedOnboardingTask,
  CURATED_ONBOARDING_TASKS,
  type CuratedOnboardingTask,
  type CuratedToolkit,
} from 'src/services/onboarding-tasks';
import {
  resolveOnboardingState,
  type OnboardingFacts,
  type OnboardingGate,
  type OnboardStateDocument,
} from 'src/services/onboarding-state';
import { readPersistedOnboarding, recordSuccessfulOnboarding } from 'src/services/onboarding-store';
import { TerminalUI } from 'src/services/terminal-ui';
import { ToolsExecutor } from 'src/services/tools-executor';
import { ComposioUserContext } from 'src/services/user-context';

export class UnsupportedOnboardingToolkitError extends Data.TaggedError(
  'commands/UnsupportedOnboardingToolkitError'
)<{ readonly message: string }> {}

class OnboardingFactsError extends Data.TaggedError('commands/OnboardingFactsError')<{
  readonly message: string;
}> {}

class OnboardingActionError extends Data.TaggedError('commands/OnboardingActionError')<{
  readonly message: string;
}> {}

class OnboardingConnectionError extends Data.TaggedError('commands/OnboardingConnectionError')<{
  readonly message: string;
}> {}

export class OnboardingToolExecutionError extends Data.TaggedError(
  'commands/OnboardingToolExecutionError'
)<{ readonly message: string }> {}

type GatheredFacts = {
  readonly facts: OnboardingFacts;
  readonly client?: RawComposioClient;
  readonly project?: ResolvedCommandProject;
  readonly activeConnectionId?: string;
};

const toolkit = Options.text('toolkit').pipe(
  Options.optional,
  Options.withDescription('Curated toolkit to connect and try')
);
const json = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Emit one machine-readable onboarding state document')
);
const status = Options.boolean('status').pipe(
  Options.withDefault(false),
  Options.withDescription('Report onboarding state without advancing it')
);

const gatherFacts = (selectedToolkit: CuratedToolkit | null, executedLocally: boolean) =>
  Effect.gen(function* () {
    const user = yield* ComposioUserContext;
    const persisted = yield* readPersistedOnboarding;
    const loggedIn = user.isLoggedIn();
    const hasExecuted = persisted.hasExecuted || executedLocally;
    if (!loggedIn || selectedToolkit === null) {
      return {
        facts: { loggedIn, toolkit: selectedToolkit, connection: 'none', hasExecuted },
      } satisfies GatheredFacts;
    }

    const project = yield* resolveCommandProject({ mode: 'consumer' }).pipe(
      Effect.mapError(
        error =>
          new OnboardingFactsError({ message: formatResolveCommandProjectError(error).message })
      )
    );
    const client = yield* (yield* ComposioClientSingleton)
      .getFor({ orgId: project.orgId, projectId: project.projectId })
      .pipe(
        Effect.mapError(
          () => new OnboardingFactsError({ message: 'Could not resolve the consumer project.' })
        )
      );
    const userId = project.consumerUserId;
    if (!userId) {
      return yield* new OnboardingFactsError({
        message: 'No consumer user is available for onboarding.',
      });
    }
    const listed = yield* Effect.tryPromise({
      try: () =>
        client.connectedAccounts.list({
          toolkit_slugs: [selectedToolkit],
          user_ids: [userId],
          statuses: ['ACTIVE', 'INITIATED', 'INITIALIZING'],
          limit: 100,
        }),
      catch: () =>
        new OnboardingFactsError({ message: 'Could not read connected account status.' }),
    });
    const accounts = yield* decodeConnectedAccountItems(listed.items).pipe(
      Effect.mapError(
        () => new OnboardingFactsError({ message: 'Connected account status was invalid.' })
      )
    );
    const active = accounts.find(account => account.status === 'ACTIVE');
    const pending = accounts.find(account =>
      ['INITIATED', 'INITIALIZING'].includes(account.status)
    );

    return {
      facts: {
        loggedIn: true,
        toolkit: selectedToolkit,
        connection: active ? 'active' : pending ? 'pending' : 'none',
        hasExecuted,
      },
      client,
      project,
      activeConnectionId: active?.id,
    } satisfies GatheredFacts;
  });

const factsChanged = (before: OnboardingFacts, after: OnboardingFacts): boolean =>
  [
    before.loggedIn !== after.loggedIn,
    before.toolkit !== after.toolkit,
    before.connection !== after.connection,
    before.hasExecuted !== after.hasExecuted,
  ].some(Boolean);

const renderHumanState = (ui: TerminalUI, state: OnboardStateDocument) =>
  Match.value(state).pipe(
    Match.when({ onboarded: true }, () => ui.outro('Onboarding complete.')),
    Match.when({ blocked_reason: 'toolkit_required' }, current =>
      ui.note(
        `Choose one with --toolkit: ${Option.getOrElse(Option.fromNullable(current.available_toolkits), () => []).join(', ')}`,
        'Available toolkits'
      )
    ),
    Match.when({ blocked_reason: 'oauth_required', toolkit: Match.string }, current =>
      ui.note(
        Option.getOrElse(
          Option.fromNullable(current.human_action),
          () =>
            `Authorization is still pending. Run \`composio link ${current.toolkit}\` to start fresh.`
        ),
        'Authorization required'
      )
    ),
    Match.orElse(current =>
      ui.log.info(
        Option.getOrElse(
          Option.firstSomeOf([
            Option.fromNullable(current.human_action),
            Option.fromNullable(current.next_command),
          ]),
          () => 'Onboarding is ready to continue.'
        )
      )
    )
  );

const withInvocationAction = (params: {
  readonly resolved: OnboardStateDocument;
  readonly task: CuratedOnboardingTask | null;
  readonly pendingLoginUrl: string | null;
  readonly pendingRedirectUrl: string | null;
}) =>
  Match.value(params).pipe(
    Match.when(
      { pendingLoginUrl: Match.string, resolved: { blocked_reason: 'login_required' } },
      current => ({
        ...current.resolved,
        human_action: current.pendingLoginUrl,
        next_command: 'composio login --poll',
      })
    ),
    Match.when(
      {
        pendingRedirectUrl: Match.string,
        resolved: { blocked_reason: 'oauth_required' },
        task: { toolkit: Match.string },
      },
      current => ({
        ...current.resolved,
        human_action: current.pendingRedirectUrl,
        next_command: `composio onboard --toolkit ${current.task.toolkit} --json`,
      })
    ),
    Match.orElse(current => current.resolved)
  );

export const runOnboard = (params: {
  readonly toolkit: Option.Option<string>;
  readonly json: boolean;
  readonly status: boolean;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const config = yield* ComposioCliUserConfig;
    const os = yield* NodeOs;
    const startedAt = yield* Clock.currentTimeMillis;
    const mode = Match.value(params).pipe(
      Match.when({ status: true }, () => 'status' as const),
      Match.when({ json: true }, () => 'json' as const),
      Match.orElse(() => 'interactive' as const)
    );
    let analyticsToolkit: CuratedToolkit | undefined;
    let analyticsGate: OnboardingGate | undefined;
    let connectionSource: 'existing' | 'resumed' | 'new' | undefined;
    let errorCode: string | undefined;
    const trackOnboarding = (name: CliOnboardingEventName) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        yield* trackCliEventEffect(
          getCliOnboardingEvent(name, {
            release_channel: config.data.channel,
            mode,
            toolkit: analyticsToolkit,
            gate: analyticsGate,
            cli_version: APP_VERSION,
            os: os.platform,
            connection_source: connectionSource,
            duration_ms: now - startedAt,
            error_code: errorCode,
          })
        );
      }).pipe(Effect.catchAllCause(() => Effect.void));

    errorCode = 'unsupported_toolkit';

    return yield* Effect.gen(function* () {
      const selectedTask = Option.flatMap(params.toolkit, findCuratedOnboardingTask);
      analyticsToolkit = Option.getOrUndefined(Option.map(selectedTask, task => task.toolkit));
      yield* trackOnboarding(CLI_ONBOARDING_EVENTS.STARTED);
      yield* Option.match(params.toolkit, {
        onNone: () => Effect.void,
        onSome: supplied =>
          Option.isSome(selectedTask)
            ? Effect.void
            : Effect.fail(
                new UnsupportedOnboardingToolkitError({
                  message: `Unsupported onboarding toolkit "${supplied}". Choose: ${CURATED_ONBOARDING_TASKS.map(task => task.toolkit).join(', ')}.`,
                })
              ),
      });

      let task = Option.getOrNull(selectedTask);
      let executedLocally = false;
      let pendingLoginUrl: string | null = null;
      let pendingRedirectUrl: string | null = null;
      errorCode = 'facts_failed';
      let gathered = yield* gatherFacts(task?.toolkit ?? null, executedLocally);
      connectionSource = Match.value(gathered.facts.connection).pipe(
        Match.when('active', () => 'existing' as const),
        Match.when('pending', () => 'resumed' as const),
        Match.orElse(() => undefined)
      );
      const attempted = new Set<OnboardingGate>();
      const { canPrompt } = yield* ui.capabilities;
      const maxAdvances = params.status ? 0 : params.json ? 1 : 3;
      const interactive = canPrompt && !params.json;

      for (let advance = 0; advance < maxAdvances; advance += 1) {
        const state = resolveOnboardingState(gathered.facts);
        const gate = state.next_gate;
        if (gate === null) break;
        analyticsGate = gate;
        errorCode = undefined;
        yield* trackOnboarding(CLI_ONBOARDING_EVENTS.GATE_VIEWED);
        if (attempted.has(gate) || state.blocked_reason === 'oauth_required') break;
        errorCode = `${gate}_failed`;

        if (gate === 'connect' && task === null) {
          if (!interactive) break;
          const selected = yield* ui.select(
            'Choose a toolkit to try',
            CURATED_ONBOARDING_TASKS.map(entry => ({
              value: entry.toolkit,
              label: entry.label,
            }))
          );
          task = Option.getOrThrow(findCuratedOnboardingTask(selected));
          analyticsToolkit = task.toolkit;
        }

        attempted.add(gate);
        switch (gate) {
          case 'login': {
            const login = yield* browserLogin({
              scope: 'user',
              noBrowser: !interactive,
              noWait: !interactive,
              skipOrgProjectPicker: true,
              suppressOutput: true,
            }).pipe(
              Effect.mapError(
                () => new OnboardingActionError({ message: 'Could not start Composio login.' })
              )
            );
            pendingLoginUrl = login.status === 'pending' ? login.url : null;
            break;
          }
          case 'connect': {
            const currentTask = Option.getOrThrow(Option.fromNullable(task));
            const linked = yield* linkRootConsumerToolkit({
              toolkit: currentTask.toolkit,
              wait: interactive,
            }).pipe(
              Effect.mapError(
                () =>
                  new OnboardingConnectionError({
                    message: `Could not connect ${currentTask.toolkit}. Run \`composio link ${currentTask.toolkit}\` and try again.`,
                  })
              )
            );
            pendingRedirectUrl = linked.status === 'pending' ? linked.redirectUrl : null;
            connectionSource = 'new';
            break;
          }
          case 'execute': {
            const currentTask = Option.getOrThrow(Option.fromNullable(task));
            const { client, project, activeConnectionId } = gathered;
            if (!client || !project?.consumerUserId || !activeConnectionId) {
              return yield* new OnboardingFactsError({
                message: 'The active connected account could not be resolved.',
              });
            }
            const result = yield* (yield* ToolsExecutor)
              .execute(currentTask.tool, {
                userId: project.consumerUserId,
                arguments: { ...currentTask.args },
                client,
                connectedAccounts: { [currentTask.toolkit]: activeConnectionId },
                toolkits: [currentTask.toolkit],
                localTools: { enable: false },
                cacheScope: {
                  orgId: project.orgId,
                  projectId: project.projectId,
                  consumerUserId: project.consumerUserId,
                },
              })
              .pipe(
                Effect.mapError(
                  () =>
                    new OnboardingToolExecutionError({
                      message: `The demo failed. Run \`composio link ${currentTask.toolkit}\` and try again.`,
                    })
                )
              );
            if (!result.successful) {
              return yield* new OnboardingToolExecutionError({
                message: `The demo failed. Run \`composio link ${currentTask.toolkit}\` and try again.`,
              });
            }
            const summary = currentTask.summarize(result.data);
            if (summary) yield* ui.log.success(summary);
            executedLocally = true;
            yield* recordSuccessfulOnboarding;
            break;
          }
        }

        errorCode = 'facts_failed';
        const next = yield* gatherFacts(task?.toolkit ?? null, executedLocally);
        if (!factsChanged(gathered.facts, next.facts)) break;
        errorCode = undefined;
        yield* trackOnboarding(CLI_ONBOARDING_EVENTS.GATE_COMPLETED);
        gathered = next;
      }

      const resolved = resolveOnboardingState(gathered.facts);
      const document = withInvocationAction({
        pendingLoginUrl,
        pendingRedirectUrl,
        resolved,
        task,
      });
      if (params.json) {
        yield* ui.output(JSON.stringify(document), { force: true });
      } else {
        yield* renderHumanState(ui, document);
      }
      errorCode = undefined;
      yield* trackOnboarding(CLI_ONBOARDING_EVENTS.COMPLETED).pipe(
        Effect.when(() => document.onboarded)
      );
      return document;
    }).pipe(Effect.tapError(() => trackOnboarding(CLI_ONBOARDING_EVENTS.FAILED)));
  });

export const onboardCmd = Command.make('onboard', { toolkit, json, status }, runOnboard).pipe(
  Command.withDescription('Log in, connect one curated toolkit, and run one read-only demo.')
);
