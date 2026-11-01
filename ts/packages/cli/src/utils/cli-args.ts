/** Locate the root command after shared options, leaving the original argv intact. */
export const rootCommandIndex = (args: ReadonlyArray<string>): number => {
  let index = 0;
  while (index < args.length && args[index].startsWith('-')) {
    if (args[index] === '--') return index;
    index += args[index] === '--log-level' ? 2 : 1;
  }
  return index;
};
