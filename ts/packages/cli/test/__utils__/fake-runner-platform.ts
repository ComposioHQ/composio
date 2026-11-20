import { ExitAction, type RunnerPlatform } from 'src/run-main';
import type { StopSignal } from 'src/services/shutdown-signal';

/** A process stand-in: signals are delivered by hand, timers fire by hand. */
export const fakeRunnerPlatform = () => {
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
