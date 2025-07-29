import * as color from 'src/ui/colors';

export const formatSpanDuration = (durationInMs: number | bigint, isLastEntry: boolean) =>
  `\r\n${isLastEntry ? ' ' : color.gray('│')}  ~ ${durationInMs}ms`;
