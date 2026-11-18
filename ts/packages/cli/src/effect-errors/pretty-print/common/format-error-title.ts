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
  const type = color.bgRed(
    color.white(` ${escapeTerminalText(String(errorType ?? 'Unknown error'))} `)
  );
  const formattedMessage = color.bold(color.white(` • ${escapeTerminalLines(String(message))}`));

  return [`💥 ${failuresCount}${type}${formattedMessage}`];
};
