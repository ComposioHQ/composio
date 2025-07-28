import * as color from 'src/ui/colors';

import { stripCwdPath } from 'effect-errors/logic/path';
import {
  formatSpanAttributes,
  formatSpanDuration,
  missingSpansWarning,
  spanStackTrailingChar,
} from 'effect-errors/pretty-print/common';
import type { ErrorSpan, PrettyPrintOptions } from 'effect-errors/types';

export const maybePrintSpansTimeline = (
  spans: ErrorSpan[] | undefined,
  isPlainString: boolean,
  { stripCwd }: PrettyPrintOptions
): string[] => {
  if (spans === undefined) {
    return isPlainString === false ? [' ', missingSpansWarning, ' '] : [];
  }

  return spans.reduce<string[]>((output, { name, durationInMilliseconds, attributes }, index) => {
    const isFirstEntry = index === 0;
    const isLastEntry = index === spans.length - 1;

    const maybeCircle = isFirstEntry ? `\r\n${color.gray('◯')}\r\n` : '';
    const trailing = spanStackTrailingChar(isLastEntry);
    const filePath = ` ${stripCwd !== undefined ? color.underline(color.bold(stripCwdPath(name))) : color.underline(name)}`;
    const duration =
      durationInMilliseconds !== undefined
        ? color.gray(formatSpanDuration(durationInMilliseconds, isLastEntry))
        : '';
    const formattedAttributes = formatSpanAttributes(attributes, isLastEntry);

    const timelineEntry = color.white(
      `${maybeCircle}${trailing}${color.gray('─')}${filePath}${duration}${formattedAttributes}`
    );

    return [...output, timelineEntry];
  }, []);
};
