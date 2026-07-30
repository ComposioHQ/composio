import { describe, expect, it } from '@effect/vitest';
import {
  isOnboardComplete,
  isOnboardSkippableStep,
  ONBOARD_GATE_STEPS,
  resolveNextOnboardStep,
  resolveOnboard,
  type OnboardFacts,
  type OnboardGateStep,
  type OnboardSkippableStep,
  type OnboardState,
} from 'src/services/onboard-state';
import { buildStateJson, nextCommandFor, resolveDemo } from 'src/commands/onboard.cmd';
import { findOnboardTaskByToolkit } from 'src/services/onboard-tasks';
import { toolkitFromToolSlug } from 'src/utils/toolkit-from-tool-slug';

const isGate = (value: string): value is OnboardGateStep =>
  ONBOARD_GATE_STEPS.some(gate => gate === value);
const intersect = <T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): ReadonlyArray<T> =>
  a.filter(value => b.includes(value));

interface Dim {
  readonly loggedIn: boolean;
  readonly connectionCheckFailed: boolean;
  readonly connectionCount: number;
  readonly hasExecuted: boolean;
  readonly invocationSkips: ReadonlyArray<OnboardSkippableStep>;
  readonly persistedSkips: ReadonlyArray<OnboardSkippableStep>;
  readonly connectedToolkits: ReadonlyArray<string>;
}

const cartesian = (): ReadonlyArray<Dim> => {
  const dims: Dim[] = [];
  for (const loggedIn of [false, true]) {
    for (const connectionCheckFailed of [false, true]) {
      for (const connectionCount of [0, 1]) {
        for (const hasExecuted of [false, true]) {
          for (const invocationSkips of [
            [] as OnboardSkippableStep[],
            ['connect'],
            ['execute'],
            ['login'],
          ] as ReadonlyArray<ReadonlyArray<OnboardSkippableStep>>) {
            for (const persistedSkips of [
              [] as OnboardSkippableStep[],
              ['connect'],
              ['execute'],
            ] as ReadonlyArray<ReadonlyArray<OnboardSkippableStep>>) {
              for (const connectedToolkits of [[], ['github'], ['salesforce']]) {
                dims.push({
                  loggedIn,
                  connectionCheckFailed,
                  connectionCount,
                  hasExecuted,
                  invocationSkips,
                  persistedSkips,
                  connectedToolkits,
                });
              }
            }
          }
        }
      }
    }
  }
  return dims;
};

interface Normalized {
  readonly facts: OnboardFacts;
  readonly state: OnboardState;
  readonly connectionCount: number;
  readonly connectedToolkits: ReadonlyArray<string>;
}

const normalize = (dim: Dim): Normalized => {
  const loggedIn = dim.loggedIn;
  const failed = loggedIn ? dim.connectionCheckFailed : false;
  const count = loggedIn && !failed ? dim.connectionCount : 0;
  const toolkits = count > 0 ? dim.connectedToolkits : [];
  const hasExecuted = dim.hasExecuted;
  const hasConnection = count > 0 || (failed && hasExecuted);

  const facts: OnboardFacts = {
    loggedIn,
    hasConnection,
    hasExecuted,
    skippedSteps: dim.persistedSkips,
    connectionCheckFailed: failed,
  };

  const state: OnboardState = {
    ...facts,
    connectionCheckFailed: failed,
    orgSelected: loggedIn,
    orgId: loggedIn ? 'org_test' : undefined,
    connectedToolkits: toolkits,
    connectionCount: count,
    pendingToolkit: undefined,
    onboardedAt: undefined,
    nextStep: resolveNextOnboardStep({ ...facts, skippedSteps: [] }),
    complete: isOnboardComplete(facts),
  };

  return { facts, state, connectionCount: count, connectedToolkits: toolkits };
};

describe('onboard state contract (invariant matrix)', () => {
  const matrix = cartesian();

  it(`covers ${matrix.length} input combinations`, () => {
    expect(matrix.length).toBeGreaterThan(500);
  });

  it('holds invariants 1-7 for every combination', () => {
    for (const dim of matrix) {
      const { facts, state } = normalize(dim);
      const label = JSON.stringify(dim);
      const r = resolveOnboard({ facts, invocationSkips: dim.invocationSkips });
      const skippedGates = r.skipped.filter(isGate);
      const connectionUnknown = Boolean(facts.connectionCheckFailed) && !facts.hasConnection;

      // Invariant 1: completed, remaining, skipped pairwise disjoint (on gates).
      expect(intersect(r.completed, r.remaining), label).toHaveLength(0);
      expect(intersect(r.completed, skippedGates), label).toHaveLength(0);
      expect(intersect(r.remaining, skippedGates), label).toHaveLength(0);

      // Invariant 2: a non-null next.step is in remaining and not completed/skipped.
      if (r.nextStep) {
        expect(r.remaining, label).toContain(r.nextStep);
        expect(r.completed, label).not.toContain(r.nextStep);
        expect(r.skipped, label).not.toContain(r.nextStep);
      }

      // Invariant 3 + 4: an unknown connection is never routed to or listed as actionable/skipped.
      if (connectionUnknown) {
        expect(r.nextStep, label).toBeUndefined();
        expect(r.remaining, label).not.toContain('connect');
        expect(r.remaining, label).not.toContain('execute');
        expect(r.skipped, label).not.toContain('connect');
        expect(r.skipped, label).not.toContain('execute');
        expect(r.connectionUnknown, label).toBe(true);
      }
      // Invariant 4: prior has_executed under a failed check stays complete.
      if (facts.loggedIn && facts.connectionCheckFailed && facts.hasExecuted) {
        expect(r.complete, label).toBe(true);
      }

      // Invariant 7: skipped lists only this-invocation skips; persisted history is separate.
      for (const gate of skippedGates) {
        expect(dim.invocationSkips, label).toContain(gate);
      }
      expect(r.persistedSkips, label).toEqual(dim.persistedSkips.filter(isOnboardSkippableStep));
      for (const persisted of dim.persistedSkips) {
        if (isGate(persisted) && !dim.invocationSkips.includes(persisted)) {
          expect(r.skipped, label).not.toContain(persisted);
        }
      }

      // Invariant 6: a non-null next.cmd must progress — execute never targets a non-curated toolkit.
      const next = nextCommandFor(state, r.nextStep);
      if (next) {
        expect(next.step, label).toBe(r.nextStep);
        if (next.step === 'execute') {
          const match = next.cmd.match(/--toolkit (\S+)/);
          if (match) {
            expect(findOnboardTaskByToolkit(match[1]!), label).toBeDefined();
            expect(state.connectedToolkits, label).toContain(match[1]!);
          }
        }
      }

      // The emitted JSON is a faithful projection of the resolution.
      const json = JSON.parse(buildStateJson({ state, invocationSkips: dim.invocationSkips })) as {
        completed: string[];
        remaining: string[];
        skipped: string[];
        persisted_skips?: string[];
        next: { step: string } | null;
      };
      expect(json.completed, label).toEqual(r.completed);
      expect(json.remaining, label).toEqual(r.remaining);
      expect(json.skipped, label).toEqual(r.skipped);
      expect(json.persisted_skips ?? [], label).toEqual(r.persistedSkips);
      expect(json.next?.step ?? undefined, label).toBe(r.nextStep);
      // JSON-level disjointness (invariant 1 on the wire).
      const jsonSkippedGates = json.skipped.filter(isGate);
      expect(intersect(json.completed, json.remaining), label).toHaveLength(0);
      expect(intersect(json.completed, jsonSkippedGates), label).toHaveLength(0);
      expect(intersect(json.remaining, jsonSkippedGates), label).toHaveLength(0);
      if (json.next) {
        expect(json.remaining, label).toContain(json.next.step);
      }
    }
  });

  // Invariant 5: execute/resolveDemo only proceeds for a toolkit actually connected.
  it('never resolves a demo for an unconnected toolkit', () => {
    const github = findOnboardTaskByToolkit('github')!;
    const combinations = [
      { connected: [] as string[], expectDemo: false },
      { connected: ['salesforce'], expectDemo: false },
      { connected: ['github'], expectDemo: true },
      { connected: ['gmail'], expectDemo: true },
    ];
    for (const { connected, expectDemo } of combinations) {
      const demo = resolveDemo({
        task: github,
        connectedToolkits: connected,
      });
      if (!expectDemo) {
        expect(demo, JSON.stringify(connected)).toBeUndefined();
      } else {
        expect(demo, JSON.stringify(connected)).toBeDefined();
        const toolkit = toolkitFromToolSlug(demo!.slug)?.toLowerCase();
        expect(
          connected.map(t => t.toLowerCase()),
          JSON.stringify(connected)
        ).toContain(toolkit);
      }
    }
  });

  it('resolveDemo never returns a demo whose toolkit is unconnected, across the matrix', () => {
    const github = findOnboardTaskByToolkit('github')!;
    for (const dim of matrix) {
      const { connectedToolkits } = normalize(dim);
      const demo = resolveDemo({
        task: github,
        connectedToolkits,
      });
      if (demo) {
        const toolkit = toolkitFromToolSlug(demo.slug)?.toLowerCase();
        expect(
          connectedToolkits.map(t => t.toLowerCase()),
          JSON.stringify(dim)
        ).toContain(toolkit);
      }
    }
  });
});
