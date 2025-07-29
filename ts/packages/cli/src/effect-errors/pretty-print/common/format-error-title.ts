import * as color from 'src/ui/colors';

export const formatErrorTitle = (
  errorType: unknown,
  message: unknown,
  failuresLength: number,
  failureIndex: number
): string[] => {
  const failuresCount =
    failuresLength > 1 ? color.bgRed(color.white(` #${failureIndex + 1} -`)) : '';
  const type = color.bgRed(
    color.white(` ${(errorType as string | undefined) ?? 'Unknown error'} `)
  );
  const formattedMessage = color.bold(color.white(` • ${message as string}`));

  return [`💥 ${failuresCount}${type}${formattedMessage}`];
};
