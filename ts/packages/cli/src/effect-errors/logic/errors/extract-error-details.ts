import { isFunction } from 'effect/Function';
import { hasProperty } from 'effect/Predicate';

interface ErrorDetails {
  isPlainString: boolean;
  type?: unknown;
  message: unknown;
}

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
      message: error.message,
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
