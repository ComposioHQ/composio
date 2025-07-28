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
      type: error._tag,
      message: error.cause,
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
      type: error._tag,
      message: error.message,
    };
  }

  const isPlainObjectsWithToStringImpl =
    hasProperty(error, 'toString') &&
    isFunction(error.toString) &&
    error.toString !== Object.prototype.toString &&
    error.toString !== Array.prototype.toString;
  if (isPlainObjectsWithToStringImpl) {
    const message = (error as { toString: () => string }).toString();
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
