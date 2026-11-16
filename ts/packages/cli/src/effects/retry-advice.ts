import { isComposioError } from '@composio/client/effect';
import { Option, Predicate } from 'effect';
import type { ClientApiError } from 'src/services/composio-errors';
import { DashboardToolExecutionError } from 'src/services/dashboard-tool-execution';

/**
 * The exit code of a failure that is safe to retry as it is: `EX_TEMPFAIL` from `sysexits.h`
 * ("a temporary failure; the user is invited to retry"). Every other failure exits 1.
 */
export const TEMPORARY_FAILURE_EXIT_CODE = 75;

/**
 * What a caller can do after a request failed:
 *
 * - `safe`: run the same command again. The request did not take effect (the API refused it with
 *   a 429), or it failed in a way that may pass on a later attempt and repeating it cannot repeat
 *   a side effect (its method is idempotent).
 * - `check-first`: the request failed in flight and may have taken effect. Running the command
 *   again could repeat its side effect, so check whether it did first.
 */
export type RetryAdvice = 'safe' | 'check-first';

/** The methods RFC 9110 defines as idempotent: repeating one has the effect of sending it once. */
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
  'TRACE',
  'PUT',
  'DELETE',
]);

/** The transport failures the client refuses to retry: a redirect it will not follow. */
const PERMANENT_CONNECTION_REASONS: ReadonlySet<string> = new Set([
  'OpaqueRedirect',
  'TooManyRedirects',
]);

const isClientApiError = (error: unknown): error is ClientApiError =>
  isComposioError(error) && error._tag !== '@composio/client/ConfigurationError';

/**
 * The failed request behind `error`: `error` itself, or the `cause` a command's error keeps (see
 * `requestError`), a few levels deep.
 */
const clientErrorOf = (error: unknown, depth = 0): Option.Option<ClientApiError> =>
  isClientApiError(error)
    ? Option.some(error)
    : depth < 3 && Predicate.hasProperty(error, 'cause')
      ? clientErrorOf(error.cause, depth + 1)
      : Option.none();

/**
 * Whether the request ended in a way a later attempt may not: the same conditions the client
 * retries a call marked `idempotent` on (see `src/services/composio-request.ts`), less a 409.
 */
const isTransient = (error: ClientApiError): boolean => {
  switch (error._tag) {
    case '@composio/client/APIConnectionTimeoutError':
      return true;
    case '@composio/client/APIConnectionError':
      return !PERMANENT_CONNECTION_REASONS.has(error.reason);
    case '@composio/client/RateLimitError':
    case '@composio/client/InternalServerError':
      return true;
    case '@composio/client/APIError':
      return error.status === 408;
    default:
      return false;
  }
};

/**
 * The advice for an execution the Dashboard transport sent (always once, as a `POST`): one that
 * got no answer, or an answer it could not read, may have run the tool; a 429 did not.
 */
const dashboardAdvice = (error: DashboardToolExecutionError): Option.Option<RetryAdvice> => {
  if (error.status === 429) return Option.some('safe');
  switch (error.reason) {
    case 'request':
    case 'timeout':
    case 'response':
      return Option.some('check-first');
    case 'dashboard':
      return error.status !== undefined && error.status >= 500
        ? Option.some('check-first')
        : Option.none();
    default:
      return Option.none();
  }
};

/**
 * The retry advice for a failed request, when there is one: none for a failure that would fail
 * the same way again (a 4xx other than 408 and 429, a read whose response failed decoding,
 * anything that is not a failed request).
 */
export const retryAdviceFor = (error: unknown): Option.Option<RetryAdvice> => {
  if (error instanceof DashboardToolExecutionError) return dashboardAdvice(error);
  return Option.flatMap(clientErrorOf(error), clientError => {
    const idempotent = IDEMPOTENT_METHODS.has(clientError.method.toUpperCase());
    // A response that arrived but could not be read: the request ran, so repeating a read fails
    // the same way, and repeating anything else may act twice.
    if (clientError._tag === '@composio/client/DecodeError') {
      return idempotent ? Option.none() : Option.some('check-first');
    }
    if (!isTransient(clientError)) return Option.none();
    if (clientError._tag === '@composio/client/RateLimitError') return Option.some('safe');
    return Option.some(idempotent ? 'safe' : 'check-first');
  });
};

/** Whether `error` is a failed request the caller can run again as it is. */
export const isSafeToRetry = (error: unknown): boolean =>
  Option.contains(retryAdviceFor(error), 'safe');

/** The line that tells the reader what to do about a failure with `advice`. */
export const retryHint = (advice: RetryAdvice): string =>
  advice === 'safe'
    ? 'This failure is temporary, and repeating the request cannot make a change twice: run the same command again in a moment.'
    : 'The request may have taken effect before it failed. Check whether it did before you run the command again, or it may happen twice.';
