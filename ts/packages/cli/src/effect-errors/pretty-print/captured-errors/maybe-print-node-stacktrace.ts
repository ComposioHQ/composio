import color from 'picocolors';

import { stripCwdPath } from 'effect-errors/logic/path';
import type { PrettyPrintOptions } from 'effect-errors/types';

export const maybePrintNodeStacktrace = (
  stack: string[] | undefined,
  isPlainString: boolean,
  { stripCwd, hideStackTrace }: PrettyPrintOptions
): string[] => {
  if (hideStackTrace) {
    return [];
  }

  const stackHasNodes = stack !== undefined && stack.length > 0;
  if (stackHasNodes) {
    const nodes = stack.map(el => `│ ${stripCwd ? stripCwdPath(el) : el}`).join('\r\n');

    return [
      '',
      `${color.bold(color.red('◯'))} ${color.redBright(color.underline('Node Stacktrace 🚨'))}`,
      color.red(nodes),
      color.red('┴'),
    ];
  }

  if (!isPlainString) {
    return [
      '',
      color.gray(
        'ℹ️  Consider using a yieldable error such as Data.TaggedError and Schema.TaggedError to get a stacktrace.'
      ),
    ];
  }

  return [];
};
