import * as color from 'src/ui/colors';

import { stripCwdPath } from 'effect-errors/logic/path';
import { missingSpansWarning, spanStackTrailingChar } from 'effect-errors/pretty-print/common';
import type { ErrorSpan, PrettyPrintOptions } from 'effect-errors/types';

// Recovered from the `Cause.StackTrace` reason annotation (see
// `logic/errors/span-annotation.ts`) — only span names and call-site
// locations are available in v4, not the v3 timeline's per-span duration or
// attributes, so each entry renders just those two lines.
export const maybePrintSpansTimeline = (
  spans: ReadonlyArray<ErrorSpan> | undefined,
  isPlainString: boolean,
  { stripCwd }: PrettyPrintOptions
): string[] => {
  if (spans === undefined) {
    return isPlainString === false ? [' ', missingSpansWarning, ' '] : [];
  }

  return spans.reduce<string[]>((output, { name, location }, index) => {
    const isFirstEntry = index === 0;
    const isLastEntry = index === spans.length - 1;

    const maybeCircle = isFirstEntry ? `\r\n${color.gray('◯')}\r\n` : '';
    const trailing = spanStackTrailingChar(isLastEntry);
    const spanName = ` ${stripCwd !== undefined ? color.underline(color.bold(stripCwdPath(name))) : color.underline(name)}`;
    const formattedLocation =
      location !== undefined
        ? `\r\n${isLastEntry ? ' ' : color.gray('│')}  ${color.gray(stripCwd !== undefined ? stripCwdPath(location) : location)}`
        : '';

    const timelineEntry = color.white(
      `${maybeCircle}${trailing}${color.gray('─')}${spanName}${formattedLocation}`
    );

    return [...output, timelineEntry];
  }, []);
};
