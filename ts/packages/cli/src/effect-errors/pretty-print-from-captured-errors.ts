import { formatCapturedError, formatTitle, interruptedMessage } from 'effect-errors/pretty-print';
import { type PrettyPrintOptions, prettyPrintOptionsDefault } from 'effect-errors/types';

import type { CapturedErrors } from './capture-errors';

export const prettyPrintFromCapturedErrors = (
  { errors, interrupted }: CapturedErrors,
  options: PrettyPrintOptions = prettyPrintOptionsDefault
) => {
  if (interrupted) {
    return interruptedMessage;
  }

  const title = formatTitle(errors.length);
  const formattedFailures = errors.map(formatCapturedError(errors.length, options));

  return [...title, ...formattedFailures].join('\r\n');
};
