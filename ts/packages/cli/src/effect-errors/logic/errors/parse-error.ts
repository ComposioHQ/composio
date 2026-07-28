import { PrettyError } from 'effect-errors/types';

import { extractErrorDetails } from './extract-error-details';
import { extractSpanAnnotation } from './span-annotation';

export const parseError = (error: unknown): PrettyError => {
  const maybeSpan = extractSpanAnnotation(error);
  const { message, type, isPlainString } = extractErrorDetails(error);

  if (error instanceof Error) {
    return new PrettyError(
      message,
      error.stack
        ?.split('\n')
        .filter(el => /at (.*)/.exec(el))
        .join('\r\n'),
      maybeSpan,
      false,
      type
    );
  }

  return new PrettyError(message, undefined, maybeSpan, isPlainString, type);
};
