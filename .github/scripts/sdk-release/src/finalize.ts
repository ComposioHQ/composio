import { FileSystem } from '@effect/platform';
import { Data, Effect } from 'effect';
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
  if (draft._tag === 'None') {
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
  for (let attempt = 0; ; attempt++) {
    if (attempt === 10) {
      return yield* new FinalizeError({
        reason: `No free changelog filename left for ${base}.mdx.`,
      });
    }
    const target = resolve(changelogDir, `${base}${attempt === 0 ? '' : `-${attempt + 1}`}.mdx`);
    const existing = yield* fs.readFileString(target).pipe(Effect.option);
    if (existing._tag === 'Some' && existing.value === content) {
      yield* Effect.log(`Draft already promoted to ${target}.`);
      break;
    }
    if (existing._tag === 'None') {
      yield* fs.writeFileString(target, content);
      yield* Effect.log(`Promoted changelog draft to ${target}.`);
      break;
    }
  }
  yield* fs.remove(draftPath);
});
