import { Duration, Schedule } from 'effect';

/**
 * How long `composio login` and `composio link` wait for the person to finish in the browser.
 * It is also the lifetime of a pending login, which `composio login --poll` waits out.
 */
export const AUTHORIZATION_TIMEOUT_MINUTES = 10;

/**
 * The default wait, and the longest one `composio login --poll --timeout` accepts: a longer
 * wait outlives the pending login it waits for.
 */
export const AUTHORIZATION_TIMEOUT_SECONDS = AUTHORIZATION_TIMEOUT_MINUTES * 60;

/** The longest wait between two checks, once the ramp has reached it. */
export const AUTHORIZATION_POLL_INTERVAL_SECONDS = 5;

/**
 * When to check a pending authorization again: after 0.3s, doubling until one check every
 * `AUTHORIZATION_POLL_INTERVAL_SECONDS`, for `timeoutSeconds` in all.
 *
 * `Schedule.min` waits for the shorter of the ramp and the spacing, which caps the ramp.
 * (`Schedule.max` would wait for the longer one, and the ramp keeps doubling: fifteen checks
 * that way take hours.) `Schedule.max` with `Schedule.during`, whose delay is zero, keeps those
 * delays and stops once the time is up — after one more check, since the deadline is noticed
 * after the delay that reaches it. A wait can therefore overshoot its bound by one poll
 * interval.
 */
export const authorizationPollScheduleFor = (timeoutSeconds: number) =>
  Schedule.max([
    Schedule.min([
      Schedule.exponential('0.3 seconds'),
      Schedule.spaced(`${AUTHORIZATION_POLL_INTERVAL_SECONDS} seconds`),
    ]),
    Schedule.during(Duration.seconds(timeoutSeconds)),
  ]);

/** The schedule a wait keeps when its caller asks for no particular bound. */
export const authorizationPollSchedule = authorizationPollScheduleFor(
  AUTHORIZATION_TIMEOUT_SECONDS
);
