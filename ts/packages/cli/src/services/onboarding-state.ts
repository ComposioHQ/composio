import { Array as Arr, Option } from 'effect';
import { findTaskByToolkit } from 'src/services/onboarding-tasks';
import type { StarterTask } from 'src/services/onboarding-tasks';

/**
 * Chokepoint 1: the single answer to "which gate is next".
 *
 * `resolveOnboardingState` is a pure function over facts. It never sees `canPrompt`, stdout's TTY
 * state, or `--json`, so every gate status and `onboarded` is identical across every invocation
 * mode for the same facts. That is the whole defect-prevention mechanism: a human and an agent
 * cannot disagree about *state*, because they read the same value from the same function. They can
 * only differ on what to do next, which is chokepoint 2 (`onboarding-next-command.ts`).
 *
 * The I/O that produces the facts lives in `gatherOnboardingFacts` (`onboarding-facts.ts`). Keeping
 * it in a sibling module is what makes the purity structural rather than a convention: this file
 * imports `effect` and the task registry and nothing else, so it has no service to reach for.
 */

/**
 * `advisory` belongs to the host-wiring gate alone: it is the "unsatisfied but non-blocking"
 * status, and no other gate is allowed to be non-blocking.
 */
export type GateStatus =
  | 'satisfied'
  | 'unsatisfied'
  | 'blocked'
  | 'skipped'
  | 'deferred'
  | 'unknown'
  | 'not_applicable'
  | 'advisory';

export type OnboardingSkip = 'connect' | 'execute';

export type HostWiringStatus = {
  readonly target: string;
  readonly available: boolean;
  readonly supported: boolean;
  readonly pluginInstalled: boolean;
  readonly pluginEnabled: boolean;
};

/**
 * `not_applicable` covers both "no supported agent host is installed" (a legitimate CLI-only
 * user) and "the host probe failed or timed out". Neither is worth blocking the front door for.
 */
export type HostWiringFact =
  | { readonly kind: 'not_applicable' }
  | { readonly kind: 'inspected'; readonly hosts: ReadonlyArray<HostWiringStatus> };

/**
 * A live, outstanding browser authorization.
 *
 * `redirectUrl` is optional because the connected-accounts list endpoint deliberately does not
 * expose it — the CLI's item schema strips `state`/`data`/`params` to keep OAuth tokens out of
 * pipeable output, and the redirect URL lives in there. So it is present only when this
 * invocation created the link itself (the link delegate returns it), and absent when the pending
 * link was discovered from a previous invocation's INITIATED account. When it is absent the
 * recovery is to re-run `composio link <toolkit>`, which mints a fresh URL.
 */
export type PendingLink = {
  readonly toolkit: string;
  readonly connectedAccountId: string;
  readonly redirectUrl: Option.Option<string>;
};

export type OnboardingFacts = {
  readonly loggedIn: boolean;
  readonly email: Option.Option<string>;
  readonly orgId: Option.Option<string>;
  /** ACTIVE toolkit slugs, or `'unknown'` when the connection check itself failed. */
  readonly connectedToolkits: ReadonlyArray<string> | 'unknown';
  readonly pendingLink: Option.Option<PendingLink>;
  readonly hasExecuted: Option.Option<{ readonly slug: string; readonly at: string }>;
  readonly requestedToolkit: Option.Option<string>;
  /** Skips apply to the invocation that carries them and are never persisted. */
  readonly invocationSkips: ReadonlyArray<OnboardingSkip>;
  readonly hostWiring: HostWiringFact;
};

export type OnboardingState = {
  readonly onboarded: boolean;
  readonly nextGate: 'login' | 'connect' | 'execute' | null;
  readonly task: string | null;
  readonly toolkit: string | null;
  readonly gates: {
    readonly hostWiring: {
      readonly status: GateStatus;
      readonly blocking: false;
      readonly hosts: ReadonlyArray<HostWiringStatus>;
    };
    readonly login: {
      readonly status: GateStatus;
      readonly email: string | null;
      readonly orgId: string | null;
    };
    readonly connect: {
      readonly status: GateStatus;
      readonly toolkit: string | null;
      readonly connectedToolkits: ReadonlyArray<string>;
      readonly connectedAccountId: string | null;
      readonly redirectUrl: string | null;
    };
    readonly execute: {
      readonly status: GateStatus;
      readonly toolSlug: string | null;
      readonly lastExecutedAt: string | null;
    };
  };
  readonly advisories: ReadonlyArray<string>;
};

const HOST_LABELS: Readonly<Record<string, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
};

const hostLabel = (target: string) => HOST_LABELS[target] ?? target;

const activeToolkits = (facts: OnboardingFacts): ReadonlyArray<string> =>
  facts.connectedToolkits === 'unknown' ? [] : facts.connectedToolkits;

/**
 * Resolve the toolkit the rest of the flow is about.
 *
 * The caller's request always wins, including when it names a non-curated toolkit — the execute
 * gate defers in that case rather than substituting a toolkit nobody asked for. Only when nothing
 * was requested does the resolver adopt one from live state, and even then it never invents a
 * target: it picks a curated toolkit the user has already connected or already started
 * authorizing.
 */
const resolveToolkit = (facts: OnboardingFacts): Option.Option<string> => {
  if (Option.isSome(facts.requestedToolkit)) {
    return facts.requestedToolkit;
  }

  const active = activeToolkits(facts);
  const connectedCurated = Arr.findFirst(active, slug => Option.isSome(findTaskByToolkit(slug)));
  if (Option.isSome(connectedCurated)) {
    return connectedCurated;
  }

  return Option.map(facts.pendingLink, link => link.toolkit);
};

const hostWiringGate = (facts: OnboardingFacts) => {
  if (facts.hostWiring.kind === 'not_applicable') {
    return {
      gate: { status: 'not_applicable' as const, blocking: false as const, hosts: [] },
      advisories: [] as ReadonlyArray<string>,
    };
  }

  const hosts = facts.hostWiring.hosts;
  const reachable = hosts.filter(host => host.available && host.supported);
  if (reachable.length === 0) {
    return {
      gate: { status: 'not_applicable' as const, blocking: false as const, hosts },
      advisories: [] as ReadonlyArray<string>,
    };
  }

  const unwired = reachable.filter(host => !host.pluginInstalled || !host.pluginEnabled);
  if (unwired.length === 0) {
    return {
      gate: { status: 'satisfied' as const, blocking: false as const, hosts },
      advisories: [] as ReadonlyArray<string>,
    };
  }

  return {
    gate: { status: 'advisory' as const, blocking: false as const, hosts },
    advisories: unwired.map(host =>
      host.pluginInstalled
        ? `${hostLabel(host.target)} detected but the Composio plugin is not enabled. Run \`composio setup\`.`
        : `${hostLabel(host.target)} detected but the Composio plugin is not installed. Run \`composio setup\`.`
    ),
  };
};

type ConnectResolution = {
  readonly status: GateStatus;
  readonly toolkit: string | null;
  readonly connectedToolkits: ReadonlyArray<string>;
  readonly connectedAccountId: string | null;
  readonly redirectUrl: string | null;
};

const connectGate = (
  facts: OnboardingFacts,
  resolvedToolkit: Option.Option<string>
): ConnectResolution => {
  const connectedToolkits = activeToolkits(facts);
  const toolkit = Option.getOrNull(resolvedToolkit);

  // Login is the precondition. Reporting `unknown` here for a logged-out user would be
  // indistinguishable from a failed connection check, which is a different recovery.
  if (!facts.loggedIn) {
    return {
      status: 'unsatisfied',
      toolkit,
      connectedToolkits,
      connectedAccountId: null,
      redirectUrl: null,
    };
  }

  if (facts.invocationSkips.includes('connect')) {
    return {
      status: 'skipped',
      toolkit,
      connectedToolkits,
      connectedAccountId: null,
      redirectUrl: null,
    };
  }

  if (facts.connectedToolkits === 'unknown') {
    return {
      status: 'unknown',
      toolkit,
      connectedToolkits: [],
      connectedAccountId: null,
      redirectUrl: null,
    };
  }

  if (toolkit !== null && connectedToolkits.includes(toolkit)) {
    return {
      status: 'satisfied',
      toolkit,
      connectedToolkits,
      connectedAccountId: null,
      redirectUrl: null,
    };
  }

  // An ACTIVE account suppresses a stale INITIATED sibling for the same toolkit, which is why
  // there is no "the pending link is now active" reconciliation step: both facts come out of one
  // list call, so they cannot describe different moments.
  const pending = Option.filter(facts.pendingLink, link => link.toolkit === toolkit);
  if (Option.isSome(pending)) {
    return {
      status: 'blocked',
      toolkit,
      connectedToolkits,
      connectedAccountId: pending.value.connectedAccountId,
      redirectUrl: Option.getOrNull(pending.value.redirectUrl),
    };
  }

  return {
    status: 'unsatisfied',
    toolkit,
    connectedToolkits,
    connectedAccountId: null,
    redirectUrl: null,
  };
};

type ExecuteResolution = {
  readonly status: GateStatus;
  readonly toolSlug: string | null;
  readonly lastExecutedAt: string | null;
  readonly task: StarterTask | undefined;
};

const executeGate = (
  facts: OnboardingFacts,
  resolvedToolkit: Option.Option<string>
): ExecuteResolution => {
  const task = Option.flatMap(resolvedToolkit, findTaskByToolkit);
  const lastExecutedAt = Option.match(facts.hasExecuted, {
    onNone: () => null,
    onSome: value => value.at,
  });
  const toolSlug = Option.match(task, {
    onNone: () => null,
    onSome: value => value.read.slug,
  });
  const resolvedTask = Option.getOrUndefined(task);

  if (Option.isSome(facts.hasExecuted)) {
    return { status: 'satisfied', toolSlug, lastExecutedAt, task: resolvedTask };
  }

  if (facts.invocationSkips.includes('execute')) {
    return { status: 'skipped', toolSlug, lastExecutedAt, task: resolvedTask };
  }

  // A named toolkit with no curated demo has nothing to run, and inventing one would mean
  // executing a tool the caller never asked for. The gate defers and points at `composio search`.
  if (Option.isSome(resolvedToolkit) && Option.isNone(task)) {
    return { status: 'deferred', toolSlug: null, lastExecutedAt, task: undefined };
  }

  return { status: 'unsatisfied', toolSlug, lastExecutedAt, task: resolvedTask };
};

/**
 * The only place that answers "which gate is next".
 *
 * Blocking gates are an ordered list, so adding a fifth gate is a list edit rather than a new
 * branch. Host wiring is absent from that list by construction (D1): a user with neither Claude
 * Code nor Codex installed is a legitimate CLI-only user, and an unwired host must never stop
 * them reaching login.
 */
export const resolveOnboardingState = (facts: OnboardingFacts): OnboardingState => {
  const hostWiring = hostWiringGate(facts);
  const resolvedToolkit = resolveToolkit(facts);

  const login = {
    status: (facts.loggedIn ? 'satisfied' : 'unsatisfied') satisfies GateStatus as GateStatus,
    email: Option.getOrNull(facts.email),
    orgId: Option.getOrNull(facts.orgId),
  };
  const connect = connectGate(facts, resolvedToolkit);
  const execute = executeGate(facts, resolvedToolkit);

  const blockingGates = [
    { gate: 'login' as const, status: login.status },
    { gate: 'connect' as const, status: connect.status },
    { gate: 'execute' as const, status: execute.status },
  ];
  const nextGate =
    blockingGates.find(
      entry =>
        entry.status === 'unsatisfied' || entry.status === 'blocked' || entry.status === 'unknown'
    )?.gate ?? null;

  // `onboarded` is login + connect + has-executed, and nothing else. A skip is invocation-only
  // and non-blocking for routing, but it never counts as a satisfied gate — otherwise
  // `--skip connect --skip execute` would report a finished onboarding that never happened.
  const onboarded =
    login.status === 'satisfied' &&
    connect.status === 'satisfied' &&
    Option.isSome(facts.hasExecuted);

  return {
    onboarded,
    nextGate,
    task: execute.task?.id ?? null,
    toolkit: Option.getOrNull(resolvedToolkit),
    gates: {
      hostWiring: hostWiring.gate,
      login,
      connect: {
        status: connect.status,
        toolkit: connect.toolkit,
        connectedToolkits: connect.connectedToolkits,
        connectedAccountId: connect.connectedAccountId,
        redirectUrl: connect.redirectUrl,
      },
      execute: {
        status: execute.status,
        toolSlug: execute.toolSlug,
        lastExecutedAt: execute.lastExecutedAt,
      },
    },
    advisories: hostWiring.advisories,
  };
};
