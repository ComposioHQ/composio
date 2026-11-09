/**
 * Model checks the runner's signal and exit handling with tla-ts. The model
 * (run-main.model.tla) describes only the process around the runner; the runner's decisions come
 * from `runnerTransition`, tabulated here over every state and event, so the model cannot drift
 * from the code it checks. The mutants prove each invariant can fail.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { check } from 'tla-ts';
import { describe, expect, it } from 'vitest';
import {
  runnerTransition,
  type RunnerEvent,
  type RunnerState,
  type RunnerTransition,
} from 'src/run-main-transition';
import { STOP_SIGNALS } from 'src/services/shutdown-signal';

type Transition = (state: RunnerState, event: RunnerEvent) => RunnerTransition;

const MODEL = fs.readFileSync(path.join(import.meta.dirname, 'run-main.model.tla'), 'utf8');

const INVARIANTS = [
  'EndsOnce',
  'SecondSignalEnds',
  'DeadlineEnds',
  'CommandsCarryTheirSignal',
  'ForcesOnlyOnEscalation',
  'EndsWithActionOnlyOnExit',
  'DrainsOnlyUnsignalled',
  'NeverStuck',
] as const;

// The model's event names, each with the runner event it stands for.
const EVENTS: ReadonlyArray<readonly [string, RunnerEvent]> = [
  ...STOP_SIGNALS.map(signal => [signal, { kind: 'Signal', signal }] as const),
  ['Deadline', { kind: 'Deadline' }],
  ['Clean', { kind: 'Exited', cleanSuccess: true }],
  ['Failed', { kind: 'Exited', cleanSuccess: false }],
];

const tla = (value: string | boolean | undefined) =>
  typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : JSON.stringify(value ?? 'none');

/** `transition` over every runner state and event, as the TLA+ operator the model imports. */
const transitionModule = (transition: Transition) => {
  const rows = [undefined, ...STOP_SIGNALS].flatMap(received =>
    [false, true].flatMap(finished =>
      EVENTS.map(([name, event]) => {
        const { state, command } = transition({ received, finished }, event);
        const signal = 'signal' in command ? command.signal : undefined;
        const guard = `received = ${tla(received)} /\\ finished = ${tla(finished)} /\\ event = ${tla(name)}`;
        const result = [tla(state.received), tla(state.finished), tla(command.kind), tla(signal)];
        return `${guard} -> <<${result.join(', ')}>>`;
      })
    )
  );
  return [
    '---- MODULE RunMainTransition ----',
    `Transition(received, finished, event) == CASE ${rows.join('\n  [] ')}`,
    '====',
  ].join('\n');
};

const modelCheck = (transition: Transition) =>
  check({
    source: MODEL,
    config: [
      'INIT Init',
      'NEXT Next',
      'CHECK_DEADLOCK FALSE',
      `INVARIANT ${INVARIANTS.join(' ')}`,
    ].join('\n'),
    loadModule: name => (name === 'RunMainTransition' ? transitionModule(transition) : undefined),
  });

const mutants: ReadonlyArray<{
  readonly name: string;
  readonly violates: (typeof INVARIANTS)[number];
  readonly transition: Transition;
}> = [
  {
    name: 'acts after the process already ended',
    violates: 'EndsOnce',
    transition: (state, event) => runnerTransition({ ...state, finished: false }, event),
  },
  {
    name: 'treats a second signal as a first one',
    violates: 'SecondSignalEnds',
    transition: (state, event) =>
      event.kind === 'Signal' && state.received !== undefined && !state.finished
        ? { state, command: { kind: 'Stop', signal: event.signal } }
        : runnerTransition(state, event),
  },
  {
    name: 'ignores the shutdown deadline',
    violates: 'DeadlineEnds',
    transition: (state, event) =>
      event.kind === 'Deadline'
        ? { state, command: { kind: 'Ignore' } }
        : runnerTransition(state, event),
  },
  {
    name: 'reports the first signal when a second one forces the exit',
    violates: 'CommandsCarryTheirSignal',
    transition: (state, event) =>
      event.kind === 'Signal' && state.received !== undefined && !state.finished
        ? {
            state: { ...state, finished: true },
            command: { kind: 'Force', signal: state.received },
          }
        : runnerTransition(state, event),
  },
  {
    name: 'forces the exit on the first signal',
    violates: 'ForcesOnlyOnEscalation',
    transition: (state, event) =>
      event.kind === 'Signal' && state.received === undefined && !state.finished
        ? {
            state: { received: event.signal, finished: true },
            command: { kind: 'Force', signal: event.signal },
          }
        : runnerTransition(state, event),
  },
  {
    name: 'forces the exit when a signalled fiber ends',
    violates: 'ForcesOnlyOnEscalation',
    transition: (state, event) =>
      event.kind === 'Exited' && state.received !== undefined && !state.finished
        ? {
            state: { ...state, finished: true },
            command: { kind: 'Force', signal: state.received },
          }
        : runnerTransition(state, event),
  },
  {
    name: 'ends on a signal with no exit action',
    violates: 'EndsWithActionOnlyOnExit',
    transition: (state, event) =>
      event.kind === 'Signal' && state.received === undefined && !state.finished
        ? { state: { received: event.signal, finished: true }, command: { kind: 'End' } }
        : runnerTransition(state, event),
  },
  {
    name: 'drains a clean exit after a signal',
    violates: 'DrainsOnlyUnsignalled',
    transition: (state, event) =>
      event.kind === 'Exited' && event.cleanSuccess && !state.finished
        ? { state: { ...state, finished: true }, command: { kind: 'Drain' } }
        : runnerTransition(state, event),
  },
  {
    name: 'ignores the fiber exit',
    violates: 'NeverStuck',
    transition: (state, event) =>
      event.kind === 'Exited'
        ? { state, command: { kind: 'Ignore' } }
        : runnerTransition(state, event),
  },
];

describe('runner model', () => {
  it('[Given] every signal, deadline and exit order [Then] runnerTransition keeps every invariant', async () => {
    const result = await modelCheck(runnerTransition);
    expect(result.violation?.name).toBeUndefined();
    expect(result.status).toBe('success');
    expect(result.distinctStates).toBeGreaterThan(100);
  });

  it.each(mutants)(
    '[Given] a runner that $name [Then] the model rejects it with $violates',
    async ({ transition, violates }) => {
      const result = await modelCheck(transition);
      expect(result.status).toBe('invariant-violation');
      expect(result.violation?.name).toBe(violates);
    }
  );
});
