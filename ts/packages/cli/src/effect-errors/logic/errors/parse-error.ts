import { hasProperty } from 'effect/Predicate';
import type { Span } from 'effect/Tracer';

import { PrettyError } from 'effect-errors/types';

import { extractErrorDetails } from './extract-error-details';

const spanSymbol = Symbol.for('effect/SpanAnnotation');

export const parseError = (error: unknown): PrettyError => {
  const maybeSpan = hasProperty(error, spanSymbol) ? (error[spanSymbol] as Span) : undefined;
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
