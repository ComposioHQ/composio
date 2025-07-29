import * as color from 'src/ui/colors';

const maybePrintPipe = (isLastEntry: boolean) => (isLastEntry ? ' ' : color.gray('│'));

export const formatSpanAttributes = (attributes: Record<string, unknown>, isLastEntry: boolean) => {
  const entries = Object.entries(attributes);
  if (entries.length === 0) {
    return [];
  }

  const lines = Array.from(entries).map(
    ([key, value]) =>
      `${maybePrintPipe(isLastEntry)}    ${color.white(key)}${color.gray(':')} ${value}`
  );

  return `\r\n${lines.join('\r\n')}`;
};
