import { Match } from 'effect';

import { stripCwdPath } from 'effect-errors/logic/path';

import { stackAtRegex } from './stack-regex';

const match = Match.type<'node' | 'effect'>().pipe(
  Match.when('effect', _ => 'at '),
  Match.when('node', _ => '│ at '),
  Match.exhaustive
);

export const filterStack = (stack: string, type: 'node' | 'effect', stripCwd: boolean) => {
  const lines = stack.split('\r\n');
  const out: string[] = [];

  for (const line of lines) {
    out.push(line.replace(/at .*effect_cutpoint.*\((.*)\)/, 'at $1'));

    if (line.includes('effect_cutpoint')) {
      return out.join('\r\n');
    }
  }

  const final = out.join('\r\n').replace(stackAtRegex, match(type));

  return stripCwd ? stripCwdPath(final) : final;
};
