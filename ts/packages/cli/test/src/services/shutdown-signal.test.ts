import { describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import {
  LISTENER_STOP,
  makeShutdownController,
  signalExitCode,
} from 'src/services/shutdown-signal';

describe('ShutdownSignal', () => {
  it.effect('[Given] no command cooperates [Then] the runner must interrupt', () =>
    Effect.sync(() => {
      expect(makeShutdownController().offer('SIGINT')).toBe(false);
    })
  );

  it.effect('[Given] a listener [Then] it takes SIGINT and SIGTERM but not SIGHUP', () =>
    Effect.gen(function* () {
      const takes = (signal: 'SIGINT' | 'SIGTERM' | 'SIGHUP') =>
        Effect.gen(function* () {
          const controller = makeShutdownController();
          yield* controller.service.cooperate(LISTENER_STOP);
          return controller.offer(signal);
        }).pipe(Effect.scoped);

      expect(yield* takes('SIGINT')).toBe(true);
      expect(yield* takes('SIGTERM')).toBe(true);
      expect(yield* takes('SIGHUP')).toBe(false);
    })
  );

  it.effect(
    '[Given] a cooperating command [When] it takes a signal [Then] `requested` yields it',
    () =>
      Effect.gen(function* () {
        const controller = makeShutdownController();
        yield* controller.service.cooperate(LISTENER_STOP);
        const waiting = yield* Effect.forkChild(controller.service.requested);

        expect(controller.offer('SIGTERM')).toBe(true);
        expect(yield* Fiber.join(waiting)).toBe('SIGTERM');
      })
  );

  it.effect('[Given] the cooperating scope closed [Then] a signal interrupts again', () =>
    Effect.gen(function* () {
      const controller = makeShutdownController();
      yield* Effect.scoped(controller.service.cooperate(LISTENER_STOP));

      expect(controller.offer('SIGINT')).toBe(false);
    })
  );

  it.effect(
    '[Given] a forced exit [Then] it runs every onForce and reports whether to re-raise',
    () =>
      Effect.gen(function* () {
        const controller = makeShutdownController();
        const forced = yield* Deferred.make<void>();
        yield* controller.service.cooperate({
          signals: ['SIGINT'],
          onForce: () => Deferred.doneUnsafe(forced, Effect.void),
          reraiseOnForce: true,
        });

        expect(controller.force()).toEqual({ reraise: true });
        expect(Deferred.isDoneUnsafe(forced)).toBe(true);
      })
  );

  it.effect('[Given] a listener only [Then] a forced exit does not re-raise', () =>
    Effect.gen(function* () {
      const controller = makeShutdownController();
      yield* controller.service.cooperate(LISTENER_STOP);

      expect(controller.force()).toEqual({ reraise: false });
    })
  );

  it.each([
    { signal: 'SIGHUP', code: 129 },
    { signal: 'SIGINT', code: 130 },
    { signal: 'SIGKILL', code: 137 },
    { signal: 'SIGTERM', code: 143 },
  ] as const)('signalExitCode($signal) is $code', ({ signal, code }) => {
    expect(signalExitCode(signal)).toBe(code);
  });
});
