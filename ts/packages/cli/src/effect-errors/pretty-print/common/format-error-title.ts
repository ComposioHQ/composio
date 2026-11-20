import { Formatter } from 'effect';
import * as color from 'src/ui/colors';
import { escapeTerminalLines, escapeTerminalText } from 'src/ui/escape-terminal-text';

export const formatErrorTitle = (
  errorType: unknown,
  message: unknown,
  failuresLength: number,
  failureIndex: number
): string[] => {
  const failuresCount =
    failuresLength > 1 ? color.bgRed(color.white(` #${failureIndex + 1} -`)) : '';
  const label = errorType ?? 'Unknown error';
  const type = color.bgRed(
    color.white(
      ` ${escapeTerminalText(typeof label === 'string' ? label : Formatter.format(label))} `
    )
  );
  const messageText =
    typeof message === 'string'
      ? message
      : Array.isArray(message) && message.every(part => typeof part === 'string')
        ? message.join(',')
        : Formatter.format(message);
  const formattedMessage = color.bold(color.white(` • ${escapeTerminalLines(messageText)}`));

  return [`💥 ${failuresCount}${type}${formattedMessage}`];
};
