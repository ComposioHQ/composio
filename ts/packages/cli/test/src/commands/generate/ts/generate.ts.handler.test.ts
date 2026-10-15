import { describe, expect, it } from 'vitest';
import { Option } from 'effect';
import { resolveTranspiled } from 'src/commands/generate/ts/generate.ts.handler';

describe('generate ts handler: resolveTranspiled', () => {
  // The only combination that skips transpiling is an explicit --output-dir
  // without --transpiled: writing into node_modules always needs JavaScript.
  it.each([
    { transpiled: false, outputDir: Option.none<string>(), expected: true },
    { transpiled: true, outputDir: Option.none<string>(), expected: true },
    { transpiled: false, outputDir: Option.some('./generated'), expected: false },
    { transpiled: true, outputDir: Option.some('./generated'), expected: true },
  ])(
    '[Given] --transpiled=$transpiled, --output-dir=$outputDir.value [Then] transpiled resolves to $expected',
    ({ transpiled, outputDir, expected }) => {
      expect(resolveTranspiled({ transpiled, outputDir })).toBe(expected);
    }
  );
});
