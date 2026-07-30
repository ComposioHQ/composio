import { Array as Arr, Effect, Option } from 'effect';
import { ComposioUserContext } from 'src/services/user-context';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { resolveCommandProject } from 'src/services/command-project';
import { decodeConnectedAccountListWithFallback } from 'src/effects/decode-connected-account-list';
import { detectSetupTargets, inspectSetupTargets } from 'src/services/setup';
import { readPersistedOnboarding } from 'src/services/onboarding-store';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import type {
  HostWiringFact,
  OnboardingFacts,
  OnboardingSkip,
  PendingLink,
} from 'src/services/onboarding-state';

/**
 * The I/O half of chokepoint 1. Every fact source is individually failure-tolerant: onboard is the
 * front door, so a wedged agent-host binary or an unreachable API must degrade a field rather than
 * fail the command.
 */

/**
 * The host probe shells out to the agent host's own CLI. Bounded so a hung `claude`/`codex`
 * binary degrades the advisory instead of hanging the front door.
 */
const HOST_PROBE_TIMEOUT = '3 seconds';

const gatherHostWiring = Effect.gen(function* () {
  const detections = yield* detectSetupTargets('auto');
  // Read-only: `allowMarketplaceConflict` keeps a conflicting marketplace from failing the
  // inspection, because onboard reports host wiring and never repairs it.
  const inspected = yield* inspectSetupTargets(detections, { allowMarketplaceConflict: true });

  return {
    kind: 'inspected' as const,
    hosts: inspected.map(status => ({
      target: status.target,
      available: status.available,
      supported: true,
      pluginInstalled: status.plugin_installed,
      pluginEnabled: status.plugin_enabled,
    })),
  };
}).pipe(
  Effect.timeout(HOST_PROBE_TIMEOUT),
  // Defects too, not just typed failures: the probe drives a third-party binary through its own
  // JSON output, and losing the front door to a host that throws is worse than losing the
  // advisory. The cause is logged rather than discarded so it stays diagnosable under --debug.
  Effect.catchAllCause(cause =>
    Effect.logDebug('onboard.host_wiring.degraded', cause).pipe(
      Effect.as<HostWiringFact>({ kind: 'not_applicable' })
    )
  )
);

type LiveConnections = {
  readonly connectedToolkits: ReadonlyArray<string> | 'unknown';
  readonly pendingLink: Option.Option<PendingLink>;
};

const UNKNOWN_CONNECTIONS: LiveConnections = {
  connectedToolkits: 'unknown',
  pendingLink: Option.none(),
};

/**
 * Both connection facts come out of one `connectedAccounts.list` call filtered to ACTIVE and
 * INITIATED. Deriving them from one response is what makes the pending link trustworthy: two calls
 * would let the ACTIVE set and the pending link describe different moments, which is exactly the
 * reconciliation problem that persisting the link created.
 */
const partitionConnections = (items: ReadonlyArray<ConnectedAccountItem>): LiveConnections => {
  const enabled = items.filter(item => !item.is_disabled);
  const connectedToolkits = Arr.dedupe(
    enabled.filter(item => item.status === 'ACTIVE').map(item => item.toolkit.slug)
  );

  const initiated = [
    ...enabled.filter(
      item => item.status === 'INITIATED' && !connectedToolkits.includes(item.toolkit.slug)
    ),
  ].sort((left, right) => right.created_at.localeCompare(left.created_at));

  return {
    connectedToolkits,
    pendingLink: Option.map(Arr.head(initiated), item => ({
      toolkit: item.toolkit.slug,
      connectedAccountId: item.id,
      // The list endpoint does not expose the redirect URL — see `PendingLink`.
      redirectUrl: Option.none<string>(),
    })),
  };
};

const gatherLiveConnections = Effect.gen(function* () {
  const clientSingleton = yield* ComposioClientSingleton;
  const resolvedProject = yield* resolveCommandProject({ mode: 'consumer' });
  const consumerUserId = resolvedProject.consumerUserId;
  if (!consumerUserId) {
    return UNKNOWN_CONNECTIONS;
  }

  const client = yield* clientSingleton.getFor({
    orgId: resolvedProject.orgId,
    projectId: resolvedProject.projectId,
  });
  const rawResult = yield* Effect.tryPromise(() =>
    client.connectedAccounts.list({
      user_ids: [consumerUserId],
      statuses: ['ACTIVE', 'INITIATED'],
      limit: 100,
    })
  );
  const decoded = yield* decodeConnectedAccountListWithFallback(rawResult);

  return partitionConnections(decoded.items);
}).pipe(
  // `'unknown'` is a first-class connect status with its own recovery, so an unreachable API
  // degrades the fact rather than failing the command. Defects included, for the same reason as
  // the host probe above.
  Effect.catchAllCause(cause =>
    Effect.logDebug('onboard.connections.degraded', cause).pipe(Effect.as(UNKNOWN_CONNECTIONS))
  )
);

export type GatherOnboardingFactsParams = {
  readonly requestedToolkit: Option.Option<string>;
  readonly invocationSkips: ReadonlyArray<OnboardingSkip>;
  /**
   * Set when this invocation logged the user in itself. The email is not persisted anywhere and
   * reading it back costs a session-info round trip, so a resumed invocation reports it as null
   * rather than paying for a field the state document only decorates with.
   */
  readonly email?: Option.Option<string>;
};

export const gatherOnboardingFacts = (params: GatherOnboardingFactsParams) =>
  Effect.gen(function* () {
    const userContext = yield* ComposioUserContext;
    const loggedIn = Option.isSome(userContext.data.apiKey);

    const [hostWiring, connections, persisted] = yield* Effect.all(
      [
        gatherHostWiring,
        loggedIn ? gatherLiveConnections : Effect.succeed(UNKNOWN_CONNECTIONS),
        readPersistedOnboarding,
      ],
      { concurrency: 'unbounded' }
    );

    return {
      loggedIn,
      email: params.email ?? Option.none(),
      orgId: userContext.data.orgId,
      connectedToolkits: loggedIn ? connections.connectedToolkits : 'unknown',
      pendingLink: connections.pendingLink,
      // The store writes both halves together, so they only disagree in a hand-edited config. A
      // missing `last_execution` then reads as "not executed", which replays one demo rather than
      // reporting a completion the config cannot evidence.
      hasExecuted: persisted.hasExecuted
        ? Option.fromNullable(persisted.lastExecution)
        : Option.none(),
      requestedToolkit: params.requestedToolkit,
      invocationSkips: params.invocationSkips,
      hostWiring,
    } satisfies OnboardingFacts;
  });
