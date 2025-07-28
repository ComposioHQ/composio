import { type Cause, reduceWithContext } from 'effect/Cause';

import type { PrettyError } from 'effect-errors/types';

import { parseError } from './parse-error';

export const captureErrorsFrom = <E>(cause: Cause<E>): readonly PrettyError[] =>
  reduceWithContext(cause, undefined, {
    emptyCase: (): readonly PrettyError[] => [],
    dieCase: (_, unknownError) => [parseError(unknownError)],
    failCase: (_, error) => [parseError(error)],
    interruptCase: () => [],
    parallelCase: (_, l, r) => [...l, ...r],
    sequentialCase: (_, l, r) => [...l, ...r],
  });
