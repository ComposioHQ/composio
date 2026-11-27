import { Clock, Duration, Effect, Schedule } from 'effect';

/**
 * How long the release waits for npm and PyPI to serve an upload and its provenance, and how
 * often it looks. npm scans every new version before serving it, which takes about 5 to 15
 * minutes, so the deadline leaves room for a slow scan.
 */
export const REGISTRY_WAIT = {
  deadline: '20 minutes',
  firstDelay: '5 seconds',
  maxDelay: '1 minute',
  requestTimeout: '30 seconds',
} as const satisfies Record<string, Duration.Input>;

export const isSuccess = (status: number) => status >= 200 && status < 300;

/** Answers that waiting can fix: not served yet, rate limited, or a registry outage. */
export const isPending = (status: number) => status === 404 || status === 429 || status >= 500;

export type RegistryDeadline = number;

export const registryDeadline: Effect.Effect<RegistryDeadline> = Effect.map(
  Clock.currentTimeMillis,
  now => now + Duration.toMillis(REGISTRY_WAIT.deadline)
);

const backoff = Schedule.exponential(REGISTRY_WAIT.firstDelay).pipe(
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, Duration.fromInputUnsafe(REGISTRY_WAIT.maxDelay)))
  ),
  Schedule.jittered
);

/**
 * Retries `effect` while its error is `pending`, backing off exponentially with jitter, until
 * `deadline` (the registry wait deadline from now, when omitted). Other errors fail at once.
 */
export const pollRegistry = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  pending: (error: E) => boolean,
  deadline?: RegistryDeadline
) =>
  Effect.gen(function* () {
    const until = deadline ?? (yield* registryDeadline);
    return yield* Effect.retry(effect, {
      schedule: backoff,
      while: error => pending(error) && Effect.map(Clock.currentTimeMillis, now => now < until),
    });
  });
