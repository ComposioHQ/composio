import * as color from 'src/ui/colors';

import type { ErrorSpan } from 'effect-errors/types';

export const maybeAdviseSpansUsage = (spans: ErrorSpan[] | undefined): string[] => {
  if (spans === undefined || spans.length === 0) {
    return ['', color.gray('ℹ️  Consider using spans to improve errors reporting.')];
  }

  return [];
};
