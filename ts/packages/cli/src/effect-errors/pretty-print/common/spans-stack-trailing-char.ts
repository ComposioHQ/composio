import * as color from 'src/ui/colors';

export const spanStackTrailingChar = (isLastEntry: boolean) =>
  isLastEntry ? color.gray('╰') : color.gray('├');
