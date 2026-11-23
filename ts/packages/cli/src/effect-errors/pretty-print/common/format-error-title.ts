import { Formatter } from 'effect';
import * as color from 'src/ui/colors';
import { escapeTerminalLines, escapeTerminalText } from 'src/ui/escape-terminal-text';

const toDisplayText = (value: unknown): string =>
  typeof value === 'string' ? value : Formatter.format(value);

export const formatErrorTitle = (
  errorType: unknown,
  message: unknown,
  failuresLength: number,
  failureIndex: number
): string[] => {
  const failuresCount =
    failuresLength > 1 ? color.bgRed(color.white(` #${failureIndex + 1} -`)) : '';
  const label = escapeTerminalText(toDisplayText(errorType ?? 'Unknown error'));
  const type = color.bgRed(color.white(` ${label} `));
  const messageText =
    Array.isArray(message) && message.every(part => typeof part === 'string')
      ? message.join(',')
      : toDisplayText(message);
  const formattedMessage = color.bold(color.white(` • ${escapeTerminalLines(messageText)}`));

  return [`💥 ${failuresCount}${type}${formattedMessage}`];
};
