import { describe, expect, it } from 'vitest';
import { Cause, Deferred, Effect, Exit, Option } from 'effect';
import { ChildProcessExited } from 'src/effects/child-process-exited';
import { ReportedFailure } from 'src/effects/report-failure';
import { exitCodeFor, makeCliRunMain, type RunnerPlatform } from 'src/run-main';
import {
  makeShutdownController,
  type ShutdownController,
  type StopSignal,
} from 'src/services/shutdown-signal';

// Each exit, then the code expected with no signal, SIGINT, SIGTERM and SIGHUP received.
const exits = [
  {
    kind: 'success',
    exit: Exit.succeed(undefined),
    expected: [0, 0, 0, 0],
  },
  {
    kind: 'interrupted',
    exit: Exit.failCause(Cause.interrupt()),
    expected: [130, 130, 143, 129],
  },
  {
    kind: 'script exited 7',
    exit: Exit.fail(new ChildProcessExited({ code: 7 })),
    expected: [7, 7, 7, 7],
  },
  {
    kind: 'reported failure',
    exit: Exit.fail(new ReportedFailure({ message: 'printed' })),
    expected: [1, 1, 1, 1],
  },
  {
    kind: 'defect',
    exit: Exit.die(new Error('boom')),
    expected: [1, 1, 1, 1],
  },
] as const;

const received = [
  { name: 'no signal', signal: Option.none<StopSignal>() },
  { name: 'SIGINT', signal: Option.some<StopSignal>('SIGINT') },
  { name: 'SIGTERM', signal: Option.some<StopSignal>('SIGTERM') },
  { name: 'SIGHUP', signal: Option.some<StopSignal>('SIGHUP') },
] as const;

const cases = exits.flatMap(({ kind, exit, expected }) =>
  received.map(({ name, signal }, index) => ({
    kind,
    name,
    exit: exit as Exit.Exit<unknown, unknown>,
    signal: signal as Option.Option<StopSignal>,
    code: expected[index],
  }))
);

describe('exitCodeFor', () => {
  it.each(cases)('[Given] $kind after $name [Then] ends as expected', ({ exit, signal, code }) => {
    expect(exitCodeFor(exit, signal)).toBe(code);
  });
});

/** A process stand-in: signals are delivered by hand, timers fire by hand. */
const fakePlatform = () => {
  const listeners = new Map<StopSignal, Set<() => void>>();
  const timers: Array<() => void> = [];
  const ended: Array<number> = [];
  let onEnd = () => {};
  const platform: RunnerPlatform = {
    on: (signal, listener) => {
      listeners.set(signal, (listeners.get(signal) ?? new Set()).add(listener));
    },
    off: (signal, listener) => {
      listeners.get(signal)?.delete(listener);
    },
    exit: code => {
      ended.push(code);
      onEnd();
    },
    schedule: (_millis, f) => {
      timers.push(f);
      return () => timers.splice(timers.indexOf(f), 1);
    },
  };
  return {
    platform,
    ended,
    timers,
    send: (signal: StopSignal) => [...(listeners.get(signal) ?? [])].forEach(f => f()),
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    /** Resolves when the runner calls exit. */
    end: new Promise<void>(resolve => {
      onEnd = resolve;
    }),
  };
};

/** Lets the runtime settle a fiber the test cannot await. */
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

const start = (controller: ShutdownController, program: Effect.Effect<unknown, unknown>) => {
  const fake = fakePlatform();
  makeCliRunMain(controller, fake.platform)(program, { disableErrorReporting: true });
  return fake;
};

describe('makeCliRunMain', () => {
  it.each([
    { signal: 'SIGINT', code: 130 },
    { signal: 'SIGTERM', code: 143 },
    { signal: 'SIGHUP', code: 129 },
  ] as const)(
    '[Given] a command that does not cooperate [When] $signal arrives [Then] it is interrupted and exits $code',
    async ({ signal, code }) => {
      const fake = start(makeShutdownController(), Effect.never);

      fake.send(signal);
      await fake.end;

      expect(fake.ended).toEqual([code]);
      expect(fake.listenerCount()).toBe(0);
    }
  );

  it('[Given] a command that cooperates [When] SIGTERM arrives [Then] it stops by itself and exits 0', async () => {
    const controller = makeShutdownController();
    const stopped = Deferred.makeUnsafe<StopSignal>();
    const program = Effect.gen(function* () {
      yield* controller.service.cooperate({ signals: ['SIGINT', 'SIGTERM'] });
      const signal = yield* controller.service.requested;
      yield* Deferred.succeed(stopped, signal);
    }).pipe(Effect.scoped);
    const fake = start(controller, program);
    await settle();

    fake.send('SIGTERM');
    await fake.end;

    expect(Deferred.isDoneUnsafe(stopped)).toBe(true);
    expect(fake.ended).toEqual([0]);
  });

  it('[Given] a cooperating command [When] a signal it does not take arrives [Then] it is interrupted', async () => {
    const controller = makeShutdownController();
    const program = controller.service
      .cooperate({ signals: ['SIGINT', 'SIGTERM'] })
      .pipe(Effect.andThen(Effect.never), Effect.scoped);
    const fake = start(controller, program);
    await settle();

    fake.send('SIGHUP');
    await fake.end;

    expect(fake.ended).toEqual([129]);
  });

  it('[Given] a stop in progress [When] a second signal arrives [Then] it forces the exit', async () => {
    const controller = makeShutdownController();
    const release = Deferred.makeUnsafe<void>();
    const program = Effect.gen(function* () {
      yield* controller.service.cooperate({ signals: ['SIGINT', 'SIGTERM'] });
      yield* controller.service.requested;
      yield* Deferred.await(release);
    }).pipe(Effect.scoped);
    const fake = start(controller, program);
    await settle();

    fake.send('SIGINT');
    await settle();
    expect(fake.ended).toEqual([]);
    fake.send('SIGTERM');
    await fake.end;

    expect(fake.ended).toEqual([143]);
    Deferred.doneUnsafe(release, Effect.void);
  });

  it('[Given] a stop that outlives the deadline [Then] the deadline forces the exit with the first signal', async () => {
    const controller = makeShutdownController();
    const release = Deferred.makeUnsafe<void>();
    const program = controller.service
      .cooperate({ signals: ['SIGINT'] })
      .pipe(
        Effect.andThen(controller.service.requested),
        Effect.andThen(Deferred.await(release)),
        Effect.scoped
      );
    const fake = start(controller, program);
    await settle();

    fake.send('SIGINT');
    expect(fake.timers).toHaveLength(1);
    fake.timers[0]!();
    await fake.end;

    expect(fake.ended).toEqual([130]);
    Deferred.doneUnsafe(release, Effect.void);
  });

  it('[Given] a stop that finishes in time [Then] the deadline is cancelled', async () => {
    const controller = makeShutdownController();
    const program = controller.service
      .cooperate({ signals: ['SIGINT'] })
      .pipe(Effect.andThen(controller.service.requested), Effect.scoped);
    const fake = start(controller, program);
    await settle();

    fake.send('SIGINT');
    await fake.end;

    expect(fake.timers).toHaveLength(0);
  });

  it('[Given] a failure without a signal [Then] it exits with the failure code', async () => {
    const fake = start(makeShutdownController(), Effect.fail(new ChildProcessExited({ code: 3 })));

    await fake.end;

    expect(fake.ended).toEqual([3]);
  });

  it('[Given] a success nobody signalled [Then] it leaves the exit to the event loop', async () => {
    const fake = start(makeShutdownController(), Effect.void);

    await settle();

    expect(fake.ended).toEqual([]);
    expect(fake.listenerCount()).toBe(0);
  });
});
