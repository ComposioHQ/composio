import type { Reason } from 'effect/Cause';

import { PrettyError } from 'effect-errors/types';

import { extractErrorDetails } from './extract-error-details';
import { extractSpanStackFrames } from './span-annotation';

export const parseError = (error: unknown, reason: Reason<unknown>): PrettyError => {
  const spans = extractSpanStackFrames(reason);
  const { message, type, isPlainString } = extractErrorDetails(error);

  if (error instanceof Error) {
    return new PrettyError(
      message,
      error.stack
        ?.split('\n')
        .filter(el => /at (.*)/.exec(el))
        .join('\r\n'),
      spans,
      false,
      type
    );
  }

  return new PrettyError(message, undefined, spans, isPlainString, type);
};
