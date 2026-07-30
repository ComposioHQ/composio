import { Command, HelpDoc, Options, ValidationError } from '@effect/cli';
import { Effect, Option, Predicate } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import {
  computeOnboardState,
  hasExecutedOnboardForOrg,
  isOnboardSkippableStep,
  ONBOARD_SKIPPABLE_STEPS,
  recordOnboardSkippedSteps,
  resolveOnboard,
  type OnboardGateStep,
  type OnboardResolution,
  type OnboardSkippableStep,
  type OnboardState,
} from 'src/services/onboard-state';
import {
  asRecord,
  findOnboardTaskByToolkit,
  findOnboardTaskForConnectedToolkits,
  matchOnboardTask,
  ONBOARD_TASKS,
  str,
  type OnboardDemoKind,
  type OnboardExecuteSummarizer,
  type OnboardFollowUpCreate,
  type OnboardTask,
} from 'src/services/onboard-tasks';
import { browserLogin } from 'src/commands/login.cmd';
import { runConnectedAccountsLink } from 'src/commands/connected-accounts/commands/connected-accounts.link.cmd';
import { runToolsExecute } from 'src/commands/tools/commands/tools.execute.cmd';
import type { ToolExecuteResponse } from 'src/services/tools-executor';
import {
  CLI_ANALYTICS_EVENTS,
  getOnboardFunnelEvent,
  type CliOnboardEventName,
} from 'src/analytics/events';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import { commandHintStep } from 'src/services/command-hints';

const human = Options.boolean('human').pipe(
  Options.withDefault(false),
  Options.withDescription('Show formatted human-readable output instead of default JSON')
);

const json = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print machine-readable state JSON (default when output is piped)')
);

const yes = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Accept prompts (org picker, demo run) without asking')
);

const task = Options.text('task').pipe(
  Options.withDescription('Pick a starter task without the menu (e.g. "read my gmail")'),
  Options.optional
);

const toolkitOpt = Options.text('toolkit').pipe(
  Options.withDescription('Pick a starter toolkit without the menu (e.g. "github")'),
  Options.optional
);

const skip = Options.text('skip').pipe(
  Options.withDescription(
    `Skip a step (${ONBOARD_SKIPPABLE_STEPS.join(', ')}). Repeat for multiple.`
  ),
  Options.repeated
);

const statusOpt = Options.boolean('status').pipe(
  Options.withDefault(false),
  Options.withDescription('Show onboarding status and exit without changing anything')
);

const invalidOptionValue = (message: string) => ValidationError.invalidValue(HelpDoc.p(message));

const track = (name: CliOnboardEventName, step?: string, properties?: Record<string, unknown>) =>
  trackCliEventEffect(getOnboardFunnelEvent({ name, step, properties }));

const curatedToolkitsList = (): string => ONBOARD_TASKS.map(task => task.toolkit).join(', ');

const noCuratedTaskMessage = (text: string): string =>
  `No starter task matches "${text}". Available: ${curatedToolkitsList()}. Try \`composio onboard --toolkit <slug>\`.`;

const emitCompletionCopy = (ui: TerminalUI) =>
  Effect.gen(function* () {
    yield* ui.log.success("That's your first Composio tool! 🎉  1,000+ apps, one command away.");
    yield* ui.log.info(
      [
        'Try a few more — just say what you want:',
        '  composio search "send myself a test Slack message"',
        '  composio search "create a GitHub issue in my repo"',
        '  composio search "what\'s on my calendar today"',
      ].join('\n')
    );
    yield* ui.log.info(
      ['Bring Composio into your coding agent (Claude Code / Codex):', '  composio setup'].join(
        '\n'
      )
    );
    yield* ui.outro("You're all set.");
  });

const stateLabel = (state: OnboardState): string => {
  if (state.complete) return 'complete';
  if (!state.loggedIn) return 'logged_out';
  if (!state.hasConnection) return 'logged_in';
  return 'connected';
};

export const nextCommandFor = (
  state: OnboardState,
  nextStep: OnboardGateStep | undefined
): { readonly step: OnboardGateStep; readonly cmd: string } | null => {
  switch (nextStep) {
    case 'login':
      return { step: 'login', cmd: 'composio login' };
    case 'connect': {
      const toolkit = state.pendingToolkit ?? ONBOARD_TASKS[0].toolkit;
      return { step: 'connect', cmd: `composio onboard --toolkit ${toolkit}` };
    }
    case 'execute': {
      const connectedTask = findOnboardTaskForConnectedToolkits(state.connectedToolkits);
      return connectedTask
        ? { step: 'execute', cmd: `composio onboard --toolkit ${connectedTask.toolkit}` }
        : { step: 'execute', cmd: 'composio search "<what you want to do>"' };
    }
    default:
      return null;
  }
};

const resolutionFor = (
  state: OnboardState,
  invocationSkips: ReadonlyArray<OnboardSkippableStep>
): OnboardResolution => resolveOnboard({ facts: state, invocationSkips });

export const buildStateJson = (params: {
  readonly state: OnboardState;
  readonly invocationSkips: ReadonlyArray<OnboardSkippableStep>;
  readonly hint?: string;
}): string => {
  const { state } = params;
  const resolution = resolutionFor(state, params.invocationSkips);
  return JSON.stringify(
    {
      // Discriminator + version: agents parse this off stdout, and the connect
      // step emits the link command's payload instead, so the shape must be
      // identifiable and safe to evolve.
      kind: 'onboard_state',
      v: 1,
      state: stateLabel(state),
      completed: resolution.completed,
      remaining: resolution.remaining,
      skipped: resolution.skipped,
      ...(resolution.persistedSkips.length > 0
        ? { persisted_skips: resolution.persistedSkips }
        : {}),
      connections: {
        count: state.connectionCount,
        toolkits: state.connectedToolkits,
        ...(state.connectionCheckFailed ? { check_failed: true } : {}),
      },
      ...(state.orgId ? { org_id: state.orgId } : {}),
      next: nextCommandFor(state, resolution.nextStep),
      ...(params.hint ? { hint: params.hint } : {}),
    },
    null,
    2
  );
};

const emitStatus = (params: {
  readonly ui: TerminalUI;
  readonly state: OnboardState;
  readonly invocationSkips: ReadonlyArray<OnboardSkippableStep>;
  readonly emitHuman: boolean;
  readonly emitJson: boolean;
  readonly forceJson: boolean;
  readonly withIntro: boolean;
}) =>
  Effect.gen(function* () {
    const { ui, state } = params;
    const resolution = resolutionFor(state, params.invocationSkips);
    if (params.withIntro) {
      yield* ui.intro('composio onboard');
    }

    if (state.loggedIn) {
      yield* ui.log.success(`Logged in${state.orgId ? ` (org ${state.orgId})` : ''}`);
    } else {
      yield* ui.log.warn('Not logged in');
    }
    if (state.connectionCheckFailed) {
      yield* ui.log.warn('Connections: unknown (could not reach the Composio API)');
    } else if (state.connectionCount > 0) {
      yield* ui.log.success(
        `${state.connectionCount} connection${state.connectionCount === 1 ? '' : 's'}: ${state.connectedToolkits.join(', ')}`
      );
    } else {
      yield* ui.log.warn('No connected apps yet');
    }
    yield* state.hasExecuted
      ? ui.log.success('First tool execution: done')
      : ui.log.warn('First tool execution: not yet');

    const next = nextCommandFor(state, resolution.nextStep);
    if (resolution.complete) {
      // Status view is for returning users; the first-run celebration belongs
      // only to the run that actually performed the first execution.
      yield* ui.outro(
        [
          'Onboarding complete.',
          '  composio search "<what you want to do>"   find and run a tool',
          '  composio setup                            use Composio from your coding agent',
        ].join('\n')
      );
    } else if (next) {
      yield* ui.outro(`Next: ${next.cmd}`);
    } else if (resolution.connectionUnknown) {
      yield* ui.outro(
        "Couldn't reach the Composio API to check your connections. Check your network and re-run `composio onboard`."
      );
    } else {
      yield* ui.outro(
        'Nothing to do (remaining steps were skipped). Re-run without --skip to continue.'
      );
    }

    if (params.emitJson || !params.emitHuman) {
      yield* ui.output(
        buildStateJson({
          state,
          invocationSkips: params.invocationSkips,
        }),
        params.forceJson ? { force: true } : undefined
      );
    }
  });

interface TaskSelection {
  readonly task: OnboardTask | undefined;
  readonly toolkit: string;
}

const selectionFromToolkit = (rawToolkit: string): TaskSelection => {
  const toolkit = rawToolkit.trim().toLowerCase();
  return { task: findOnboardTaskByToolkit(toolkit), toolkit };
};

const selectionFromTaskText = (text: string): TaskSelection | undefined => {
  const curated = matchOnboardTask(text);
  return curated ? { task: curated, toolkit: curated.toolkit } : undefined;
};

const orderTasksConnectedFirst = (
  connectedToolkits: ReadonlyArray<string>
): ReadonlyArray<OnboardTask> => {
  const connected = new Set(connectedToolkits.map(toolkit => toolkit.toLowerCase()));
  const isConnected = (task: OnboardTask) => connected.has(task.toolkit);
  return [
    ...ONBOARD_TASKS.filter(isConnected),
    ...ONBOARD_TASKS.filter(task => !isConnected(task)),
  ];
};

const resolveInteractiveSelection = (params: {
  readonly ui: TerminalUI;
  readonly toolkit: Option.Option<string>;
  readonly task: Option.Option<string>;
  readonly connectedToolkits: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    if (Option.isSome(params.toolkit)) {
      return selectionFromToolkit(params.toolkit.value);
    }
    if (Option.isSome(params.task)) {
      const selection = selectionFromTaskText(params.task.value);
      if (!selection) {
        yield* params.ui.log.error(noCuratedTaskMessage(params.task.value));
      }
      return selection;
    }

    const connected = new Set(params.connectedToolkits.map(toolkit => toolkit.toLowerCase()));
    const choice = yield* params.ui.select<string>('What do you want to try first?', [
      ...orderTasksConnectedFirst(params.connectedToolkits).map(candidate => ({
        value: candidate.id,
        label: candidate.label,
        hint: connected.has(candidate.toolkit)
          ? 'connected'
          : `connects ${candidate.toolkit} via OAuth`,
      })),
    ]);

    const curated = ONBOARD_TASKS.find(candidate => candidate.id === choice);
    return curated ? { task: curated, toolkit: curated.toolkit } : undefined;
  });

export interface OnboardDemo {
  readonly slug: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly kind: OnboardDemoKind;
  readonly summarize?: OnboardExecuteSummarizer;
}

export const resolveDemo = (params: {
  readonly task: OnboardTask | undefined;
  readonly connectedToolkits: ReadonlyArray<string>;
}): OnboardDemo | undefined => {
  const connected = new Set(params.connectedToolkits.map(toolkit => toolkit.toLowerCase()));
  const task =
    params.task && connected.has(params.task.toolkit)
      ? params.task
      : findOnboardTaskForConnectedToolkits(params.connectedToolkits);
  if (!task) {
    return undefined;
  }
  return {
    slug: task.demo.toolSlugHint,
    args: task.demo.sampleArgs,
    kind: task.demo.kind,
    summarize: task.demo.summarize,
  };
};

const genericExecuteSummary = (data: Record<string, unknown>): string | undefined => {
  const d = { ...data, ...asRecord(data.data) };
  const login = str(d.login) ?? str(d.username);
  const idNum =
    typeof d.number === 'number' ? d.number : typeof d.id === 'number' ? d.id : undefined;
  const title = str(d.title) ?? str(d.name) ?? str(d.subject);
  const url = str(d.html_url) ?? str(d.url) ?? str(d.permalink);
  const parts: string[] = [];
  if (login) parts.push(`@${login}`);
  if (idNum !== undefined) parts.push(`#${idNum}`);
  if (title) parts.push(`'${title}'`);
  if (url) parts.push(`→ ${url}`);
  return parts.length > 0 ? parts.join(' ') : undefined;
};

const stripControlChars = (value: string): string =>
  value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');

const showExecuteSummary = (
  ui: TerminalUI,
  summarize: OnboardExecuteSummarizer | undefined,
  result: ToolExecuteResponse
) =>
  Effect.gen(function* () {
    const line =
      summarize?.(result.data) ?? genericExecuteSummary(result.data) ?? 'Execution successful';
    const suffix = result.logId ? ` (logId: ${result.logId})` : '';
    yield* ui.log.success(`${stripControlChars(line)}${suffix}`);
  });

const executeDemo = (params: {
  readonly ui: TerminalUI;
  readonly demo: OnboardDemo;
  readonly quiet: boolean;
}) => {
  const base = {
    slug: params.demo.slug,
    data: Option.some(JSON.stringify(params.demo.args)),
    file: Option.none<string>(),
    account: Option.none<string>(),
    userId: Option.none<string>(),
    projectName: Option.none<string>(),
    surface: 'root',
    projectMode: 'consumer',
    getSchema: false,
    dryRun: false,
    skipConnectionCheck: false,
    skipToolParamsCheck: false,
    skipChecks: false,
    inlineOnly: true,
  } as const;
  const run = params.quiet
    ? runToolsExecute({
        ...base,
        quiet: true,
        onSuccess: result => showExecuteSummary(params.ui, params.demo.summarize, result),
      })
    : runToolsExecute(base);
  return run.pipe(
    Effect.tapError(() =>
      params.ui.log.warn(
        'First run did not succeed — fix the inputs above and re-run `composio onboard` (it resumes at this step).'
      )
    )
  );
};

const preRunSafety = (kind: OnboardDemoKind): string => {
  switch (kind) {
    case 'reversible_create':
      return 'creates something you can delete right after';
    case 'read':
      return 'safe, read-only';
  }
};

const offerFollowUpCreate = (params: {
  readonly ui: TerminalUI;
  readonly followUp: OnboardFollowUpCreate;
}) =>
  Effect.gen(function* () {
    const { ui, followUp } = params;
    const wants = yield* ui.confirm(`Want to try creating something? (${followUp.label})`, {
      defaultValue: false,
    });
    if (!wants) {
      yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_SKIPPED, 'create', { origin: 'prompt' });
      return;
    }

    yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_STARTED, 'create', {
      slug: followUp.toolSlugHint,
    });

    const args: Record<string, unknown> = { ...(followUp.fixedArgs ?? {}) };
    for (const arg of followUp.requiredArgs) {
      const value = yield* ui.text(arg.prompt, { placeholder: arg.placeholder });
      if (Option.isNone(value)) {
        yield* ui.log.info('No problem — you can create something later with `composio execute`.');
        yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_SKIPPED, 'create', {
          origin: 'missing_arg',
          arg: arg.key,
        });
        return;
      }
      args[arg.key] = value.value;
    }

    yield* ui.log.step(`Creating with ${followUp.toolSlugHint}…`);
    yield* runToolsExecute({
      slug: followUp.toolSlugHint,
      data: Option.some(JSON.stringify(args)),
      file: Option.none(),
      account: Option.none(),
      userId: Option.none(),
      projectName: Option.none(),
      surface: 'root',
      projectMode: 'consumer',
      getSchema: false,
      dryRun: false,
      skipConnectionCheck: false,
      skipToolParamsCheck: false,
      skipChecks: false,
      quiet: true,
      inlineOnly: true,
      onSuccess: result => showExecuteSummary(ui, followUp.summarize, result),
    }).pipe(
      Effect.tap(() =>
        Effect.gen(function* () {
          yield* ui.log.info('Remember to close/archive it when you are done.');
          yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_COMPLETED, 'create', {
            slug: followUp.toolSlugHint,
          });
        })
      ),
      Effect.catchAll(error =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Onboard follow-up create failed:', error);
          yield* ui.log.warn(
            'That create did not go through — check the error above and try `composio execute` when ready.'
          );
        })
      )
    );
  });

const runNonInteractiveOnboard = (params: {
  readonly ui: TerminalUI;
  readonly state: OnboardState;
  readonly invocationSkips: ReadonlyArray<OnboardSkippableStep>;
  readonly task: Option.Option<string>;
  readonly toolkit: Option.Option<string>;
  readonly emitHuman: boolean;
  readonly emitJson: boolean;
  readonly forceJson: boolean;
}) =>
  Effect.gen(function* () {
    const { ui, state } = params;
    const connectSkipped = params.invocationSkips.includes('connect');
    const executeSkipped = params.invocationSkips.includes('execute');

    const selection = Option.isSome(params.toolkit)
      ? selectionFromToolkit(params.toolkit.value)
      : Option.isSome(params.task)
        ? selectionFromTaskText(params.task.value)
        : undefined;
    const connected = new Set(state.connectedToolkits.map(toolkit => toolkit.toLowerCase()));

    if (state.loggedIn && selection?.toolkit) {
      const target = selection.toolkit;
      if (!connected.has(target) && !connectSkipped && !state.connectionCheckFailed) {
        yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_STARTED, 'connect', {
          toolkit: target,
          task_id: selection.task?.id ?? 'custom',
          mode: 'non_interactive',
        });
        const linkOutcome = yield* runConnectedAccountsLink({
          toolkit: Option.some(target),
          authConfig: Option.none(),
          userId: Option.none(),
          projectName: Option.none(),
          noWait: true,
          noBrowser: true,
          alias: Option.none(),
          list: false,
          rootOnly: true,
        });
        if (linkOutcome !== 'not_started') {
          return;
        }
        yield* ui.output(
          buildStateJson({
            state,
            invocationSkips: params.invocationSkips,
            hint: `Could not create a connection link for "${target}" — see the error above. Re-run \`composio onboard --toolkit ${target}\` to retry.`,
          }),
          params.forceJson ? { force: true } : undefined
        );
        return;
      }
      if (connected.has(target) && !executeSkipped && !state.hasExecuted) {
        const demo = resolveDemo({
          task: selection.task,
          connectedToolkits: [target],
        });
        if (demo) {
          yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_STARTED, 'execute', {
            slug: demo.slug,
            mode: 'non_interactive',
          });
          yield* executeDemo({ ui, demo, quiet: false });
          yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_COMPLETED, 'execute', {
            slug: demo.slug,
          });
          yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_COMPLETED);
          const cliConfig = yield* ComposioCliUserConfig;
          if (!hasExecutedOnboardForOrg(cliConfig.data.onboard, state.orgId)) {
            yield* ui.output(
              buildStateJson({
                state: { ...state, hasConnection: true, hasExecuted: true, complete: true },
                invocationSkips: params.invocationSkips,
                hint: 'Your first execution succeeded, but saving onboarding progress failed (config directory not writable). Treat onboarding as complete — do not re-run `composio onboard`.',
              }),
              params.forceJson ? { force: true } : undefined
            );
          }
          return;
        }
      }
    }

    const hint = yield* Effect.sync((): string | undefined => {
      if (selection?.toolkit && !connected.has(selection.toolkit) && state.connectionCheckFailed) {
        return `Couldn't verify whether "${selection.toolkit}" is connected. Re-run \`composio onboard\` once the Composio API is reachable.`;
      }
      if (Option.isSome(params.task) && !selection) {
        return noCuratedTaskMessage(params.task.value);
      }
      return undefined;
    });
    if (params.emitHuman && !params.emitJson) {
      if (hint) {
        yield* ui.log.warn(hint);
      }
      yield* emitStatus({
        ui,
        state,
        invocationSkips: params.invocationSkips,
        emitHuman: true,
        emitJson: false,
        forceJson: false,
        withIntro: false,
      });
      return;
    }
    yield* ui.output(
      buildStateJson({
        state,
        invocationSkips: params.invocationSkips,
        hint,
      }),
      params.forceJson ? { force: true } : undefined
    );
  });

const runInteractiveOnboard = (params: {
  readonly ui: TerminalUI;
  readonly state: OnboardState;
  readonly invocationSkips: ReadonlyArray<OnboardSkippableStep>;
  readonly yes: boolean;
  readonly task: Option.Option<string>;
  readonly toolkit: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const { ui } = params;
    const connectSkipped = params.invocationSkips.includes('connect');
    const executeSkipped = params.invocationSkips.includes('execute');
    const loginNeeded = (state: OnboardState) =>
      resolveOnboard({ facts: state, invocationSkips: params.invocationSkips }).nextStep ===
      'login';

    yield* ui.intro('composio onboard');

    let state = params.state;

    if (loginNeeded(state)) {
      yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_STARTED, 'login');
      yield* ui.log.step('Log in to Composio');
      yield* browserLogin({
        scope: 'user',
        noBrowser: false,
        skipOrgProjectPicker: params.yes,
        embedded: true,
      });
      const ctx = yield* ComposioUserContext;
      if (!ctx.isLoggedIn()) {
        yield* ui.log.warn('Login did not complete.');
        yield* ui.outro('Re-run `composio onboard` to resume.');
        return;
      }
      yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_COMPLETED, 'login');
      state = yield* computeOnboardState;
    }

    if (!state.loggedIn) {
      yield* ui.outro(
        'Login was skipped — run `composio onboard` again without `--skip login` to continue.'
      );
      return;
    }

    const selection = yield* resolveInteractiveSelection({
      ui,
      toolkit: params.toolkit,
      task: params.task,
      connectedToolkits: state.connectedToolkits,
    });
    if (!selection) {
      yield* ui.outro('Re-run `composio onboard` anytime to pick a starter task.');
      return;
    }
    const selectedTask = selection.task;
    const targetToolkit = selection.toolkit;

    const isConnected = () =>
      state.connectedToolkits.some(t => t.toLowerCase() === targetToolkit!.toLowerCase());

    if (!isConnected()) {
      if (connectSkipped) {
        yield* ui.outro(
          'Connecting an app was skipped — run `composio onboard` again without `--skip connect` to continue.'
        );
        return;
      }
      if (state.connectionCheckFailed) {
        yield* ui.outro(
          "Couldn't reach the Composio API to check your connections. Check your network and re-run `composio onboard`."
        );
        return;
      }
      yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_STARTED, 'connect', {
        toolkit: targetToolkit,
        task_id: selectedTask?.id ?? 'custom',
      });
      yield* ui.log.step(`Connect ${targetToolkit} (opens your browser for OAuth)`);
      const linkOutcome = yield* runConnectedAccountsLink({
        toolkit: Option.some(targetToolkit),
        authConfig: Option.none(),
        userId: Option.none(),
        projectName: Option.none(),
        noWait: false,
        noBrowser: false,
        alias: Option.none(),
        list: false,
        rootOnly: true,
      }).pipe(
        Effect.catchIf(
          error => Predicate.isTagged(error, 'commands/ConnectionPollingError'),
          () => Effect.succeed('abandoned' as const)
        )
      );
      if (linkOutcome === 'abandoned') {
        yield* ui.log.warn(`No active connection for "${targetToolkit}" yet.`);
        yield* ui.outro('Finish authorizing in the browser, then re-run `composio onboard`.');
        return;
      }
      if (linkOutcome === 'not_started') {
        yield* ui.outro(
          `The connection for "${targetToolkit}" was not created — fix the error above and re-run \`composio onboard\`.`
        );
        return;
      }
      state = yield* computeOnboardState;
      if (state.connectionCheckFailed) {
        yield* ui.outro(
          "Couldn't reach the Composio API to verify the connection. Re-run `composio onboard` in a moment."
        );
        return;
      }
      if (!isConnected()) {
        yield* ui.log.warn(`No active connection for "${targetToolkit}" yet.`);
        yield* ui.outro('Finish authorizing in the browser, then re-run `composio onboard`.');
        return;
      }
      yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_COMPLETED, 'connect', {
        toolkit: targetToolkit,
      });
    } else {
      yield* ui.log.success(`${targetToolkit} already connected`);
    }

    if (state.hasExecuted) {
      yield* ui.outro(
        [
          "You're all set — you've already run your first tool.",
          '  composio search "<what you want to do>"   find and run a tool',
        ].join('\n')
      );
      return;
    }

    if (executeSkipped) {
      yield* ui.outro(
        'Your first execution was skipped — run `composio onboard` again without `--skip execute` to finish.'
      );
      return;
    }

    const demoTask = selectedTask ?? findOnboardTaskByToolkit(targetToolkit);
    const demo = resolveDemo({
      task: demoTask,
      connectedToolkits: [targetToolkit],
    });
    if (!demo) {
      yield* ui.log.info(
        commandHintStep('Find something to run', 'root.search') +
          '\n' +
          commandHintStep('Then execute it', 'root.execute')
      );
      yield* ui.outro(
        'Almost there — your first successful `composio execute` completes onboarding.'
      );
      return;
    }

    yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_STARTED, 'execute', { slug: demo.slug });
    yield* ui.log.step(`Ready — this runs ${demo.slug} (${preRunSafety(demo.kind)})`);
    const confirmed =
      params.yes || (yield* ui.confirm(`Run ${demo.slug} now?`, { defaultValue: true }));
    if (!confirmed) {
      yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_SKIPPED, 'execute', { origin: 'prompt' });
      yield* ui.outro(
        `No problem — run it anytime:\n> composio execute ${demo.slug} -d '${JSON.stringify(demo.args)}'`
      );
      return;
    }

    yield* executeDemo({ ui, demo, quiet: true });
    yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_COMPLETED, 'execute', { slug: demo.slug });
    yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_COMPLETED);

    const cliConfig = yield* ComposioCliUserConfig;
    if (!hasExecutedOnboardForOrg(cliConfig.data.onboard, state.orgId)) {
      yield* ui.log.warn(
        'Progress could not be saved (check that the config directory is writable) — you may see this onboarding again.'
      );
    }

    if (!params.yes && demoTask?.followUpCreate) {
      yield* offerFollowUpCreate({ ui, followUp: demoTask.followUpCreate });
    }

    yield* emitCompletionCopy(ui);
  });

export const onboardCmd = Command.make(
  'onboard',
  { human, json, yes, task, toolkit: toolkitOpt, skip, status: statusOpt },
  ({ human, json, yes, task, toolkit, skip, status }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const terminal = yield* ui.capabilities;
      const interactive = terminal.canPrompt;

      const invocationSkips: OnboardSkippableStep[] = [];
      for (const value of skip) {
        const normalized = value.trim().toLowerCase();
        if (!isOnboardSkippableStep(normalized)) {
          return yield* Effect.fail(
            invalidOptionValue(
              `Invalid --skip value "${value}". Expected one of: ${ONBOARD_SKIPPABLE_STEPS.join(', ')}.`
            )
          );
        }
        invocationSkips.push(normalized);
      }

      const emitHuman = human;
      const emitJson = json || !emitHuman;

      if (status) {
        const state = yield* computeOnboardState;
        yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STATUS_VIEWED, undefined, {
          complete: state.complete,
          next_step: state.nextStep ?? null,
          forced: true,
        });
        yield* emitStatus({
          ui,
          state,
          invocationSkips,
          emitHuman,
          emitJson,
          forceJson: json,
          withIntro: interactive,
        });
        return;
      }

      if (invocationSkips.length > 0) {
        const config = yield* ComposioCliUserConfig;
        const alreadySkipped = new Set(config.data.onboard.skippedSteps);
        const freshSkips = invocationSkips.filter(step => !alreadySkipped.has(step));
        yield* recordOnboardSkippedSteps(invocationSkips);
        yield* Effect.forEach(freshSkips, step =>
          track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STEP_SKIPPED, step, { origin: 'flag' })
        );
      }

      const state = yield* computeOnboardState;

      if (state.complete) {
        yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STATUS_VIEWED, undefined, {
          complete: true,
        });
        yield* emitStatus({
          ui,
          state,
          invocationSkips,
          emitHuman,
          emitJson,
          forceJson: json,
          withIntro: interactive,
        });
        return;
      }

      yield* track(CLI_ANALYTICS_EVENTS.CLI_ONBOARD_STARTED, undefined, {
        resume_step: state.nextStep ?? null,
        mode: interactive ? 'interactive' : 'non_interactive',
      });

      if (!interactive) {
        return yield* runNonInteractiveOnboard({
          ui,
          state,
          invocationSkips,
          task,
          toolkit,
          emitHuman,
          emitJson,
          forceJson: json,
        });
      }

      return yield* runInteractiveOnboard({
        ui,
        state,
        invocationSkips,
        yes,
        task,
        toolkit,
      });
    })
).pipe(
  Command.withDescription(
    [
      'Guided setup: log in, connect an app via OAuth, and run your first tool.',
      'State-driven and resumable — run it anytime; it continues where you left off',
      'and shows a status view once everything is set up.',
      '',
      'Examples:',
      '  composio onboard',
      '  composio onboard --status',
      '  composio onboard --toolkit github',
      '  composio onboard --task "read my gmail"',
      '  composio onboard --yes',
      '  composio onboard --skip execute',
      '',
      'Non-interactive (agents/pipes): never prompts; emits JSON describing the',
      'current state and the single next command to run.',
    ].join('\n')
  )
);
