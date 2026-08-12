import { isFunction } from 'effect/Function';
import { hasProperty } from 'effect/Predicate';

interface ErrorDetails {
  isPlainString: boolean;
  type?: unknown;
  message: unknown;
}

// Wrappers like UpgradeBinaryError carry the actionable specifics (a
// ParseError path, an HTTP body) in `cause`; surface the deepest message so
// the rendered error is debuggable, not just the wrapper's summary line.
const causeDetail = (cause: unknown): string | undefined => {
  const seen = new Set<unknown>();
  let current: unknown = cause;
  let detail: string | undefined;

  while (current !== undefined && current !== null) {
    if (typeof current === 'object') {
      if (seen.has(current)) break;
      seen.add(current);
    }

    if (typeof current === 'string' && current.length > 0) {
      detail = current;
    } else if (
      hasProperty(current, 'message') &&
      typeof current.message === 'string' &&
      current.message.length > 0
    ) {
      detail = current.message;
    }

    current = hasProperty(current, 'cause') ? current.cause : undefined;
  }

  return detail;
};

const withCauseDetail = (message: string, cause: unknown): string => {
  const detail = causeDetail(cause);
  return detail !== undefined && detail !== message ? `${message}\nCaused by: ${detail}` : message;
};

export const extractErrorDetails = (error: unknown): ErrorDetails => {
  if (typeof error === 'string') {
    return {
      isPlainString: true,
      message: error,
    };
  }

  const isTaggedErrorWithCause =
    error instanceof Error && hasProperty(error, 'cause') && hasProperty(error, '_tag');
  if (isTaggedErrorWithCause) {
    return {
      isPlainString: false,
      type: error.name,
      message: withCauseDetail(error.message, error.cause),
    };
  }

  const isTaggedErrorWithErrorCtor = error instanceof Error && hasProperty(error, 'error');
  if (isTaggedErrorWithErrorCtor) {
    return {
      isPlainString: false,
      type: error.name,
      message: error.error,
    };
  }

  const isPlainObjectsWithTagAttribute =
    hasProperty(error, '_tag') && hasProperty(error, 'message');
  if (isPlainObjectsWithTagAttribute) {
    return {
      isPlainString: false,
      type: error['_tag'],
      message: error.message,
    };
  }

  if (hasProperty(error, 'toString')) {
    const toString = error.toString;
    const isPlainObjectsWithToStringImpl =
      isFunction(toString) &&
      toString !== Object.prototype.toString &&
      toString !== Array.prototype.toString;
    if (!isPlainObjectsWithToStringImpl) {
      return { message: `Error: ${JSON.stringify(error)}`, isPlainString: false };
    }

    const message = String(toString.call(error));
    const maybeWithUnderlyingType = message.split(': ');

    if (maybeWithUnderlyingType.length > 1) {
      const [type, ...message] = maybeWithUnderlyingType;

      return {
        isPlainString: false,
        type,
        message,
      };
    }

    return { message, isPlainString: false };
  }

  return { message: `Error: ${JSON.stringify(error)}`, isPlainString: false };
};
