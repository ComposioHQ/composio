import { formatErrorTitle, maybeWarnAboutPlainStrings } from 'effect-errors/pretty-print/common';
import type { PrettyPrintOptions } from 'effect-errors/types';

import type { ErrorData } from '../capture-errors';
import {
  maybeAdviseSpansUsage,
  maybePrintNodeStacktrace,
  maybePrintSpansTimeline,
  printEffectStacktrace,
} from './captured-errors';

export const formatCapturedError =
  (failuresCount: number, options: PrettyPrintOptions) =>
  ({ errorType, message, stack, spans, sources, isPlainString }: ErrorData, index: number) => {
    const title = formatErrorTitle(errorType, message, failuresCount, index);
    const plainStringWarning = maybeWarnAboutPlainStrings(isPlainString);
    const spansTimeline = maybePrintSpansTimeline(spans, isPlainString, options);
    const spansUsageAdvice = maybeAdviseSpansUsage(spans);

    const effectStacktrace = printEffectStacktrace(sources, spans, options);
    const nodeStacktrace = maybePrintNodeStacktrace(stack, isPlainString, options);

    return [
      ...title,
      ...plainStringWarning,
      ...spansTimeline,
      ...spansUsageAdvice,
      '',
      ...effectStacktrace,
      ...nodeStacktrace,
      '',
    ].join(' \r\n');
  };
