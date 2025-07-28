import color from 'picocolors';

export const spanStackTrailingChar = (isLastEntry: boolean) =>
  isLastEntry ? color.gray('╰') : color.gray('├');
