import { type Cause, isDieReason, isFailReason } from 'effect/Cause';

import type { PrettyError } from 'effect-errors/types';

import { parseError } from './parse-error';

// v4 flattens Cause to a `reasons` array of Fail | Die | Interrupt entries
// (see ts/vendor/effect/migration/cause.md). Interrupt reasons are dropped,
// mirroring v3's `interruptCase: () => []`.
export const captureErrorsFrom = <E>(cause: Cause<E>): readonly PrettyError[] =>
  cause.reasons.flatMap((reason): readonly PrettyError[] => {
    if (isFailReason(reason)) {
      return [parseError(reason.error, reason)];
    }
    if (isDieReason(reason)) {
      return [parseError(reason.defect, reason)];
    }
    return [];
  });
