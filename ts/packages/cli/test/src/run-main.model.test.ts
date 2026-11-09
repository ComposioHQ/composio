/**
 * Model checks the runner's signal and exit handling with tla-ts. The model
 * (run-main.model.tla) describes only the process around the runner; the runner's decisions come
 * from `runnerTransition`, tabulated here over every state and event, so the model cannot drift
 * from the code it checks. The mutants prove each invariant can fail.
 *
 * The replay then runs every behavior of the model through the real `makeCliRunMain`, which
 * checks what the model cannot: that the runner performs each decision as the model assumes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Deferred, Effect } from 'effect';
import { check, type CheckOptions } from 'tla-ts';
import { describe, expect, it } from 'vitest';
import { ChildProcessExited } from 'src/effects/child-process-exited';
import { ExitAction, makeCliRunMain } from 'src/run-main';
import {
  runnerTransition,
  type RunnerEvent,
  type RunnerState,
  type RunnerTransition,
} from 'src/run-main-transition';
import {
  STOP_SIGNALS,
  makeShutdownController,
  signalExitCode,
  type StopSignal,
} from 'src/services/shutdown-signal';
import { fakeRunnerPlatform } from 'test/__utils__/fake-runner-platform';

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

const modelCheck = (transition: Transition, options: Partial<CheckOptions> = {}) =>
  check({
    ...options,
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

/** A model state, as the DOT state graph prints it. */
interface ModelState {
  readonly received: string;
  readonly cooperates: ReadonlyArray<StopSignal>;
  readonly fiber: 'running' | 'stopping' | 'interrupted' | 'exited';
  readonly listening: boolean;
  readonly deadline: boolean;
  readonly ends: number;
  readonly event: string;
  readonly last: string;
  readonly signal: string;
}

interface Behavior {
  readonly name: string;
  readonly initial: ModelState;
  readonly steps: ReadonlyArray<{ readonly action: string; readonly state: ModelState }>;
}

const unescapeDot = (text: string) =>
  text.replace(/\\(.)/g, (_, char: string) => (char === 'n' ? '\n' : char));

/** Parses one state label: `/\ name = value` lines of strings, numbers, booleans and string sets. */
const parseState = (label: string): ModelState => {
  const parseValue = (value: string): unknown => {
    if (value === 'TRUE' || value === 'FALSE') return value === 'TRUE';
    if (value.startsWith('{')) return value === '{}' ? [] : JSON.parse(`[${value.slice(1, -1)}]`);
    return JSON.parse(value);
  };
  const entries = unescapeDot(label)
    .split('\n')
    .map(line => /^\/\\ (\w+) = (.*)$/.exec(line))
    .filter(match => match !== null)
    .map(([, name, value]) => [name, parseValue(value!)] as const);
  return Object.fromEntries(entries) as unknown as ModelState;
};

/** Every complete behavior of the model, from tla-ts's DOT dump of its state graph. */
const modelBehaviors = async (): Promise<ReadonlyArray<Behavior>> => {
  const written = new Map<string, string>();
  const result = await modelCheck(runnerTransition, {
    dump: { path: 'states.dot', dot: true, actionLabels: true },
    writeFile: (file, content) => void written.set(file, content),
  });
  if (result.status !== 'success') {
    throw new Error(`The runner model failed: ${result.status}`);
  }
  const dot = [...written.values()].join('\n');
  const quoted = '"((?:[^"\\\\]|\\\\.)*)"';
  const states = new Map(
    [...dot.matchAll(new RegExp(`^(-?\\d+) \\[label=${quoted}`, 'gm'))].map(([, id, label]) => [
      id!,
      parseState(label!),
    ])
  );
  const edges = [...dot.matchAll(new RegExp(`^(-?\\d+) -> (-?\\d+) \\[label=${quoted}`, 'gm'))].map(
    ([, from, to, action]) => ({ from: from!, to: to!, action: unescapeDot(action!) })
  );
  const targets = new Set(edges.map(edge => edge.to));
  const extend = (id: string, steps: Behavior['steps']): ReadonlyArray<Behavior['steps']> => {
    const next = edges.filter(edge => edge.from === id);
    return next.length === 0
      ? [steps]
      : next.flatMap(edge =>
          extend(edge.to, [...steps, { action: edge.action, state: states.get(edge.to)! }])
        );
  };
  return [...states.keys()]
    .filter(id => !targets.has(id))
    .flatMap(id =>
      extend(id, []).map(steps => {
        const initial = states.get(id)!;
        const cooperates = initial.cooperates.join(' ') || 'nothing';
        const actions = steps.map(step => step.action).join(', ');
        return { name: `cooperating on ${cooperates}: ${actions}`, initial, steps };
      })
    );
};

/** Lets the runtime settle the fiber after a step. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Runs `behavior` through the real runner: a command that cooperates on the model's signals,
 * then exits cleanly, fails, or finishes being interrupted when the model says so.
 */
const replay = async ({ initial, steps }: Behavior) => {
  const controller = makeShutdownController();
  const fake = fakeRunnerPlatform();
  const exit = Deferred.makeUnsafe<boolean>();
  const interruptHeld = Deferred.makeUnsafe<void>();
  const observed = { offered: [] as Array<StopSignal>, interrupted: false };
  const program = Effect.gen(function* () {
    if (initial.cooperates.length > 0) {
      yield* controller.service.cooperate({ signals: initial.cooperates });
      yield* Effect.forkScoped(
        controller.service.requested.pipe(
          Effect.tap(signal => Effect.sync(() => observed.offered.push(signal)))
        )
      );
    }
    const clean = yield* Deferred.await(exit).pipe(
      // Hold an interrupted fiber until the model lets it exit.
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          observed.interrupted = true;
        }).pipe(Effect.andThen(Deferred.await(interruptHeld)))
      )
    );
    if (!clean) {
      return yield* Effect.fail(new ChildProcessExited({ code: 7 }));
    }
  }).pipe(Effect.scoped);
  makeCliRunMain(controller, fake.platform)(program, { disableErrorReporting: true });
  await settle();

  const expected = {
    ended: [] as Array<ExitAction>,
    offered: [] as Array<StopSignal>,
    interrupted: false,
  };
  await steps.reduce(async (previous, { action, state }, index) => {
    const before = await previous;
    const signal = /^Signal\("(\w+)"\)$/.exec(action)?.[1] as StopSignal | undefined;
    if (signal !== undefined) {
      fake.send(signal);
    } else if (action === 'DeadlineFires') {
      expect(fake.timers).toHaveLength(1);
      fake.timers[0]!();
    } else if (before.fiber === 'interrupted') {
      Deferred.doneUnsafe(interruptHeld, Effect.void);
    } else {
      Deferred.doneUnsafe(exit, Effect.succeed(action === 'FiberExits(TRUE)'));
    }
    await settle();

    if (state.fiber === 'stopping' && before.fiber === 'running') {
      expected.offered.push(state.signal as StopSignal);
    }
    if (state.fiber === 'interrupted' && before.fiber === 'running') {
      expected.interrupted = true;
    }
    if (state.ends > before.ends && state.last === 'Force') {
      expected.ended.push(
        ExitAction.ExitWith({ code: signalExitCode(state.signal as StopSignal) })
      );
    }
    if (state.ends > before.ends && state.last === 'End') {
      const code =
        before.fiber === 'interrupted'
          ? signalExitCode(state.received as StopSignal)
          : state.event === 'Clean'
            ? 0
            : 7;
      expected.ended.push(ExitAction.ExitWith({ code }));
    }
    const at = `after ${steps
      .slice(0, index + 1)
      .map(step => step.action)
      .join(', ')}`;
    expect(fake.ended, at).toEqual(expected.ended);
    expect(observed, at).toEqual({ offered: expected.offered, interrupted: expected.interrupted });
    expect(fake.listenerCount(), at).toBe(state.listening ? STOP_SIGNALS.length : 0);
    expect(fake.timers, at).toHaveLength(state.deadline ? 1 : 0);
    return state;
  }, Promise.resolve(initial));
  Deferred.doneUnsafe(exit, Effect.succeed(true));
  Deferred.doneUnsafe(interruptHeld, Effect.void);
};

const behaviors = await modelBehaviors();

describe('runner replay', () => {
  it('[Given] the model [Then] it has a behavior for every order of events to replay', () => {
    expect(behaviors.length).toBeGreaterThan(100);
  });

  it.each(behaviors)(
    '[Given] a command $name [When] replayed through makeCliRunMain [Then] the runner does what the model says',
    replay
  );
});
