import { describe, expect, it } from 'vitest';
import { Array as Arr, Option, pipe } from 'effect';
import { resolveTranspiled } from 'src/commands/generate/ts/generate.ts.handler';

const transpiledFlag = [false, true] as const;
const outputDirFlag = [Option.none<string>(), Option.some('./generated')] as const;

const table = pipe(
  Arr.Do,
  Arr.bind('transpiled', () => transpiledFlag),
  Arr.bind('outputDir', () => outputDirFlag)
);

describe('generate ts handler: resolveTranspiled', () => {
  for (const params of table) {
    const given = `--transpiled ${params.transpiled ? 'given' : 'absent'}, --output-dir ${
      Option.isSome(params.outputDir) ? 'given' : 'absent'
    }`;
    // The only combination that skips transpiling is an explicit --output-dir
    // without --transpiled: writing into node_modules always needs JavaScript.
    const skipsTranspile = !params.transpiled && Option.isSome(params.outputDir);

    it(`[Given] ${given} [Then] transpiled resolves to ${!skipsTranspile}`, () => {
      expect(resolveTranspiled(params)).toBe(!skipsTranspile);
    });
  }
});
