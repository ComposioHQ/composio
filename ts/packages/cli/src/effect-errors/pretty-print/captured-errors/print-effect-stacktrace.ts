import * as color from 'src/ui/colors';

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
    `${color.bold(color.redBright('◯'))} ${color.redBright('Sources')} 🕵️`,
    ...paths.map(({ path, name }) =>
      color.redBright(`│ at ${name.length === 0 ? 'module code' : color.underline(name)} (${path})`)
    ),
    color.redBright('┴'),
  ];
};
