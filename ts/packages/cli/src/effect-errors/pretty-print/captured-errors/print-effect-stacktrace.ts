import color from 'picocolors';

import { stripCwdPath } from 'effect-errors/logic/path';
import type { ErrorRelatedSources } from 'effect-errors/sourcemaps';
import type { ErrorSpan, PrettyPrintOptions } from 'effect-errors/types';

export const printEffectStacktrace = (
  sources: Omit<ErrorRelatedSources, '_tag'>[] | undefined,
  spans: ErrorSpan[] | undefined,
  { stripCwd }: PrettyPrintOptions
) => {
  const isEmpty =
    spans === undefined || spans.length === 0 || sources === undefined || sources.length === 0;
  if (isEmpty) {
    return [];
  }

  const paths = sources.map(({ name, runPath, sourcesPath }) => {
    const path = sourcesPath ?? runPath;
    return { path: stripCwd ? stripCwdPath(path) : path, name };
  });

  return [
    `${color.bold(color.red('◯'))} ${color.red('Sources')} 🕵️`,
    ...paths.map(({ path, name }) =>
      color.red(`│ at ${name.length === 0 ? 'module code' : color.underline(name)} (${path})`)
    ),
    color.red('┴'),
  ];
};
