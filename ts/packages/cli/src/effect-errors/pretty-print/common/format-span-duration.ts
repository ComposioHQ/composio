import color from 'picocolors';

export const formatSpanDuration = (durationInMs: number | bigint, isLastEntry: boolean) =>
  `\r\n${isLastEntry ? ' ' : color.gray('│')}  ~ ${durationInMs}ms`;
