import { describe, expect, it } from 'vitest';
import { Cause, Deferred, Effect, Exit, Option } from 'effect';
import { ChildProcessExited, ChildProcessSignaled } from 'src/effects/child-process-exited';
import { ReportedFailure } from 'src/effects/report-failure';
import { ExitAction, exitActionFor, makeCliRunMain, type RunnerPlatform } from 'src/run-main';
import {
  makeShutdownController,
  type ShutdownController,
  type StopSignal,
} from 'src/services/shutdown-signal';

const exitWith = (code: number): ExitAction => ExitAction.ExitWith({ code });
const reraiseKill: ExitAction = ExitAction.Reraise({ signal: 'SIGKILL' });

// Each exit, then the action expected with no signal, SIGINT, SIGTERM and SIGHUP received.
const exits = [
  {
    kind: 'success',
    exit: Exit.succeed(undefined),
    expected: [exitWith(0), exitWith(0), exitWith(0), exitWith(0)],
  },
  {
    kind: 'interrupted',
    exit: Exit.failCause(Cause.interrupt()),
    expected: [exitWith(130), exitWith(130), exitWith(143), exitWith(129)],
  },
  {
    kind: 'child exited 7',
    exit: Exit.fail(new ChildProcessExited({ code: 7 })),
    expected: [exitWith(7), exitWith(7), exitWith(7), exitWith(7)],
  },
  {
    kind: 'child killed',
    exit: Exit.fail(new ChildProcessSignaled({ signal: 'SIGKILL' })),
    expected: [reraiseKill, reraiseKill, reraiseKill, reraiseKill],
  },
  {
    kind: 'reported failure',
    exit: Exit.fail(new ReportedFailure({ message: 'printed' })),
    expected: [exitWith(1), exitWith(1), exitWith(1), exitWith(1)],
  },
  {
    kind: 'defect',
    exit: Exit.die(new Error('boom')),
    expected: [exitWith(1), exitWith(1), exitWith(1), exitWith(1)],
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
    action: expected[index],
  }))
);

describe('exitActionFor', () => {
  it.each(cases)(
    '[Given] $kind after $name [Then] ends as expected',
    ({ exit, signal, action }) => {
      expect(exitActionFor(exit, signal)).toEqual(action);
    }
  );
});

/** A process stand-in: signals are delivered by hand, timers fire by hand. */
const fakePlatform = () => {
  const listeners = new Map<StopSignal, Set<() => void>>();
  const timers: Array<() => void> = [];
  const ended: Array<ExitAction> = [];
  let onEnd = () => {};
  const platform: RunnerPlatform = {
    on: (signal, listener) => {
      listeners.set(signal, (listeners.get(signal) ?? new Set()).add(listener));
    },
    off: (signal, listener) => {
      listeners.get(signal)?.delete(listener);
    },
    exit: code => {
      ended.push(ExitAction.ExitWith({ code }));
      onEnd();
    },
    raise: signal => {
      ended.push(ExitAction.Reraise({ signal }));
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
    /** Resolves on the first exit or re-raise. */
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

      expect(fake.ended).toEqual([ExitAction.ExitWith({ code })]);
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
    expect(fake.ended).toEqual([ExitAction.ExitWith({ code: 0 })]);
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

    expect(fake.ended).toEqual([ExitAction.ExitWith({ code: 129 })]);
  });

  it.each([
    { reraiseOnForce: false, ended: ExitAction.ExitWith({ code: 143 }) },
    { reraiseOnForce: true, ended: ExitAction.Reraise({ signal: 'SIGTERM' }) },
  ])(
    '[Given] a stop in progress [When] a second signal arrives (reraise: $reraiseOnForce) [Then] it forces the exit',
    async ({ reraiseOnForce, ended }) => {
      const controller = makeShutdownController();
      const release = Deferred.makeUnsafe<void>();
      let forced = 0;
      const program = Effect.gen(function* () {
        yield* controller.service.cooperate({
          signals: ['SIGINT', 'SIGTERM'],
          onForce: () => {
            forced += 1;
          },
          reraiseOnForce,
        });
        yield* controller.service.requested;
        // A stop that never finishes on its own.
        yield* Deferred.await(release);
      }).pipe(Effect.scoped);
      const fake = start(controller, program);
      await settle();

      fake.send('SIGINT');
      await settle();
      expect(fake.ended).toEqual([]);
      fake.send('SIGTERM');
      await fake.end;

      expect(forced).toBe(1);
      expect(fake.ended).toEqual([ended]);
      Deferred.doneUnsafe(release, Effect.void);
    }
  );

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

    expect(fake.ended).toEqual([ExitAction.ExitWith({ code: 130 })]);
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

  it('[Given] a child a signal ended [Then] the runner re-raises that signal', async () => {
    const fake = start(
      makeShutdownController(),
      Effect.fail(new ChildProcessSignaled({ signal: 'SIGINT' }))
    );

    await fake.end;

    expect(fake.ended).toEqual([ExitAction.Reraise({ signal: 'SIGINT' })]);
  });

  it('[Given] a failure without a signal [Then] it exits with the failure code', async () => {
    const fake = start(makeShutdownController(), Effect.fail(new ChildProcessExited({ code: 3 })));

    await fake.end;

    expect(fake.ended).toEqual([ExitAction.ExitWith({ code: 3 })]);
  });

  it('[Given] a success nobody signalled [Then] it leaves the exit to the event loop', async () => {
    const fake = start(makeShutdownController(), Effect.void);

    await settle();

    expect(fake.ended).toEqual([]);
    expect(fake.listenerCount()).toBe(0);
  });
});
