import { Console, Effect, Stdio, Stream } from 'effect';
import { readFile, runMain } from './runtime';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const SDK_RELEASE_KEY = /(?:^|\n)sdkRelease\s*:\s*\S/;

export const isSdkChangelog = (contents: string) =>
  SDK_RELEASE_KEY.test(contents.match(FRONTMATTER)?.[1] ?? '');

/** Reads changelog paths from stdin and prints those that are not generated SDK release entries. */
const main = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio;
  const input = yield* stdio.stdin.pipe(Stream.decodeText(), Stream.mkString);
  for (const path of input.split('\n').filter(Boolean))
    if (!isSdkChangelog(yield* readFile(path))) yield* Console.log(path);
});

if (import.meta.main) runMain(main);
