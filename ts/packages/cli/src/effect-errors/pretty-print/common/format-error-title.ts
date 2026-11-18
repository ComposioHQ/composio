import * as color from 'src/ui/colors';
import { escapeTerminalText } from 'src/ui/escape-terminal-text';

export const formatErrorTitle = (
  errorType: unknown,
  message: unknown,
  failuresLength: number,
  failureIndex: number
): string[] => {
  const failuresCount =
    failuresLength > 1 ? color.bgRed(color.white(` #${failureIndex + 1} -`)) : '';
  // The type and message can come from a remote error: escaped before they are styled, so the
  // title stays one line.
  const type = color.bgRed(
    color.white(` ${escapeTerminalText(String(errorType ?? 'Unknown error'))} `)
  );
  const formattedMessage = color.bold(color.white(` • ${escapeTerminalText(String(message))}`));

  return [`💥 ${failuresCount}${type}${formattedMessage}`];
};
