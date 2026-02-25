export const parseCsv = (value: string): string[] =>
  value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
