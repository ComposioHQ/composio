import { Data, Effect, Option } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
} from 'src/services/command-project';
import { decodeConnectedAccountItemsWithFallback } from 'src/effects/decode-connected-account-list';

export const ONBOARD_GATE_STEPS = ['login', 'connect', 'execute'] as const;
export type OnboardGateStep = (typeof ONBOARD_GATE_STEPS)[number];

export const ONBOARD_SKIPPABLE_STEPS = ONBOARD_GATE_STEPS;
export type OnboardSkippableStep = OnboardGateStep;

export const isOnboardSkippableStep = (value: string): value is OnboardSkippableStep =>
  ONBOARD_SKIPPABLE_STEPS.some(step => step === value);

export interface OnboardFacts {
  readonly loggedIn: boolean;
  readonly hasConnection: boolean;
  readonly hasExecuted: boolean;
  readonly skippedSteps: ReadonlyArray<string>;
  readonly connectionCheckFailed?: boolean;
}

export interface OnboardState extends OnboardFacts {
  readonly orgSelected: boolean;
  readonly orgId: string | undefined;
  readonly connectedToolkits: ReadonlyArray<string>;
  readonly connectionCount: number;
  readonly connectionCheckFailed: boolean;
  readonly pendingToolkit: string | undefined;
  readonly onboardedAt: string | undefined;
  readonly nextStep: OnboardGateStep | undefined;
  readonly complete: boolean;
}

export const isOnboardComplete = (facts: OnboardFacts): boolean =>
  facts.loggedIn && facts.hasConnection && facts.hasExecuted;

export const resolveNextOnboardStep = (facts: OnboardFacts): OnboardGateStep | undefined => {
  const skipped = new Set(facts.skippedSteps);
  if (!facts.loggedIn) {
    return skipped.has('login') ? undefined : 'login';
  }
  if (!facts.hasConnection) {
    if (facts.connectionCheckFailed) {
      return undefined;
    }
    return skipped.has('connect') ? undefined : 'connect';
  }
  if (!facts.hasExecuted) {
    return skipped.has('execute') ? undefined : 'execute';
  }
  return undefined;
};

export interface OnboardResolution {
  readonly completed: ReadonlyArray<OnboardGateStep>;
  readonly remaining: ReadonlyArray<OnboardGateStep>;
  readonly skipped: ReadonlyArray<OnboardSkippableStep>;
  readonly nextStep: OnboardGateStep | undefined;
  readonly complete: boolean;
  readonly connectionUnknown: boolean;
}

const gateSatisfied = (facts: OnboardFacts, gate: OnboardGateStep): boolean =>
  gate === 'login' ? facts.loggedIn : gate === 'connect' ? facts.hasConnection : facts.hasExecuted;

export const resolveOnboard = (params: {
  readonly facts: OnboardFacts;
  readonly invocationSkips: ReadonlyArray<OnboardSkippableStep>;
}): OnboardResolution => {
  const { facts } = params;
  const effectiveSkips = new Set<OnboardSkippableStep>(params.invocationSkips);
  const connectionUnknown = Boolean(facts.connectionCheckFailed) && !facts.hasConnection;
  const isUnresolvableGate = (gate: OnboardGateStep): boolean =>
    connectionUnknown && gate !== 'login';

  const completed = ONBOARD_GATE_STEPS.filter(gate => gateSatisfied(facts, gate));
  const nextStep = resolveNextOnboardStep({ ...facts, skippedSteps: params.invocationSkips });

  const remaining: OnboardGateStep[] = [];
  for (const gate of ONBOARD_GATE_STEPS) {
    if (completed.includes(gate)) continue;
    if (effectiveSkips.has(gate) || isUnresolvableGate(gate)) break;
    remaining.push(gate);
  }

  const skipped = [...effectiveSkips].filter(
    step => !completed.includes(step) && !isUnresolvableGate(step)
  );

  return {
    completed,
    remaining,
    skipped,
    nextStep,
    complete: isOnboardComplete(facts),
    connectionUnknown,
  };
};

interface ConnectionSnapshot {
  readonly toolkits: ReadonlyArray<string>;
  readonly count: number;
  readonly failed: boolean;
  readonly pendingToolkit: string | undefined;
}

const NO_CONNECTIONS: ConnectionSnapshot = {
  toolkits: [],
  count: 0,
  failed: false,
  pendingToolkit: undefined,
};

class OnboardConnectionLookupError extends Data.TaggedError(
  'services/OnboardConnectionLookupError'
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const fetchConnectionSnapshot = Effect.gen(function* () {
  const clientSingleton = yield* ComposioClientSingleton;
  const resolvedProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(
    Effect.mapError(formatResolveCommandProjectError)
  );
  const consumerUserId = resolvedProject.consumerUserId;
  if (!consumerUserId) {
    return NO_CONNECTIONS;
  }
  const client = yield* clientSingleton.getFor({
    orgId: resolvedProject.orgId,
    projectId: resolvedProject.projectId,
  });
  const response = yield* Effect.tryPromise({
    try: () =>
      client.connectedAccounts.list({
        user_ids: [consumerUserId],
        statuses: ['ACTIVE', 'INITIATED'],
        limit: 100,
      }),
    catch: cause =>
      new OnboardConnectionLookupError({
        message: 'Failed to list connected accounts while computing onboarding state.',
        cause,
      }),
  });
  const items = yield* decodeConnectedAccountItemsWithFallback(response.items);
  const active = items.filter(item => item.status === 'ACTIVE');
  const toolkits = [...new Set(active.map(item => item.toolkit.slug.toLowerCase()))];
  const activeToolkits = new Set(toolkits);
  const pendingToolkit = items
    .filter(
      item => item.status === 'INITIATED' && !activeToolkits.has(item.toolkit.slug.toLowerCase())
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    ?.toolkit.slug.toLowerCase();
  return {
    toolkits,
    count: active.length,
    failed: false,
    pendingToolkit,
  } satisfies ConnectionSnapshot;
});

export const computeOnboardState = Effect.gen(function* () {
  const ctx = yield* ComposioUserContext;
  const cliConfig = yield* ComposioCliUserConfig;

  const loggedIn = ctx.isLoggedIn();
  const orgId = Option.getOrUndefined(ctx.data.orgId);
  const onboard = cliConfig.data.onboard;

  const connections = loggedIn
    ? yield* fetchConnectionSnapshot.pipe(
        Effect.catchAll(cause =>
          Effect.logDebug('Onboard connection lookup failed:', cause).pipe(
            Effect.as({
              toolkits: [],
              count: 0,
              failed: true,
              pendingToolkit: undefined,
            } satisfies ConnectionSnapshot)
          )
        )
      )
    : NO_CONNECTIONS;

  // Onboarding is a one-time introduction for the CLI user. Connections remain
  // org-scoped, but switching orgs must not replay the introductory execution.
  const hasExecuted = onboard.hasExecuted;
  const facts: OnboardFacts = {
    loggedIn,
    hasConnection: connections.count > 0 || (connections.failed && hasExecuted),
    hasExecuted,
    // `--skip` is invocation-only; persisted skips made a bare future run
    // disagree with the state reported by the invocation that recorded them.
    skippedSteps: [],
    connectionCheckFailed: connections.failed,
  };

  return {
    ...facts,
    orgSelected: orgId !== undefined,
    orgId,
    connectedToolkits: connections.toolkits,
    connectionCount: connections.count,
    connectionCheckFailed: connections.failed,
    pendingToolkit: connections.pendingToolkit,
    onboardedAt: onboard.onboardedAt,
    nextStep: resolveNextOnboardStep({ ...facts, skippedSteps: [] }),
    complete: isOnboardComplete(facts),
  } satisfies OnboardState;
});

export type OnboardPersistOutcome = 'recorded' | 'already_recorded' | 'persist_failed';

export const recordOnboardExecuted: Effect.Effect<
  OnboardPersistOutcome,
  never,
  ComposioCliUserConfig
> = Effect.gen(function* () {
  const cliConfig = yield* ComposioCliUserConfig;
  const onboard = cliConfig.data.onboard;
  if (onboard.hasExecuted) {
    return 'already_recorded' as const;
  }
  yield* cliConfig.update({
    onboard: {
      ...cliConfig.raw.onboard,
      hasExecuted: true,
      onboardedAt: Option.some(new Date().toISOString()),
    },
  });
  return 'recorded' as const;
}).pipe(
  Effect.catchAll(cause =>
    Effect.logDebug('Onboard execute-record persist failed:', cause).pipe(
      Effect.as('persist_failed' as const)
    )
  )
);

export const getLocalOnboardNudge = (facts: {
  readonly loggedIn: boolean;
  readonly hasExecuted: boolean;
}): string | undefined => {
  if (facts.loggedIn && facts.hasExecuted) {
    return undefined;
  }
  const next = facts.loggedIn
    ? 'connect an app and run your first tool'
    : 'log in to your Composio account';
  return [
    'Welcome to Composio — connect AI agents to 1000+ apps.',
    '',
    'Finish getting set up (resumable, takes ~2 minutes):',
    '',
    '  composio onboard',
    '',
    `Next step: ${next}.`,
    'Run `composio --help` to see all commands.',
  ].join('\n');
};
