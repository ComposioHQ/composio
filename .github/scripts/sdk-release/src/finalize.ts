import { FileSystem } from '@effect/platform';
import { Data, Effect, Option, Stream } from 'effect';
import { resolve } from 'node:path';
import { changelogDir, draftPath } from './shared.ts';

export class FinalizeError extends Data.TaggedError('FinalizeError')<{ readonly reason: string }> {
  override get message() {
    return this.reason;
  }
}

/**
 * Promote the reviewed draft into the public changelog collection, byte-exact
 * except for the internal input-hash marker. Idempotent: re-runs detect an
 * already-promoted draft and only clean up.
 */
export const finalize = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const draft = yield* fs.readFileString(draftPath).pipe(Effect.option);
  if (Option.isNone(draft)) {
    return yield* Effect.log('No changelog draft to finalize.');
  }
  const content = draft.value
    .split('\n')
    .filter(line => !line.startsWith('{/* sdk-release input-hash'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  const date = content.match(/^date: "(\d{4})-(\d{2})-(\d{2})"$/m);
  if (date === null) {
    return yield* new FinalizeError({ reason: `Draft at ${draftPath} has no date frontmatter.` });
  }
  const [, year = '', month = '', day = ''] = date;
  const base = `${month}-${day}-${year.slice(2)}`;
  const slot = yield* Stream.range(0, 9).pipe(
    Stream.map(n => resolve(changelogDir, `${base}${n === 0 ? '' : `-${n + 1}`}.mdx`)),
    Stream.mapEffect(target =>
      fs
        .readFileString(target)
        .pipe(Effect.option, Effect.map(existing => ({ target, existing })))
    ),
    Stream.filter(
      ({ existing }) => Option.isNone(existing) || Option.contains(existing, content)
    ),
    Stream.runHead
  );
  yield* Option.match(slot, {
    onNone: () => new FinalizeError({ reason: `No free changelog filename left for ${base}.mdx.` }),
    onSome: ({ target, existing }) =>
      Option.match(existing, {
        onNone: () =>
          fs
            .writeFileString(target, content)
            .pipe(Effect.zipRight(Effect.log(`Promoted changelog draft to ${target}.`))),
        onSome: () => Effect.log(`Draft already promoted to ${target}.`),
      }),
  });
  yield* fs.remove(draftPath);
});
