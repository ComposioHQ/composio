import { Data, Effect, Schema } from 'effect';

/**
 * What the checker does with one fence, decided by the options after its language:
 * ```typescript signature``` marks a generated method signature, and
 * ```typescript nocheck="reason"``` opts an authored example out with a stated reason.
 */
export type FenceMode =
  | { readonly _tag: 'Checked' }
  | { readonly _tag: 'Signature' }
  | { readonly _tag: 'OptedOut'; readonly reason: string };

const CHECKED: FenceMode = { _tag: 'Checked' };
const SIGNATURE: FenceMode = { _tag: 'Signature' };

export class FenceOptionError extends Data.TaggedError('FenceOptionError')<{
  readonly message: string;
}> {}

const optionError = (meta: string, problem: string) =>
  new FenceOptionError({ message: `Invalid fence options \`${meta}\`: ${problem}` });

const FenceOptions = Schema.Struct({
  signature: Schema.optionalKey(Schema.Literal(true)),
  nocheck: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/\S/, { message: 'nocheck needs a non-empty reason' }))
  ),
});

const OPTION = /\s*([A-Za-z][\w-]*)(?:="([^"]*)")?\s*/y;

/** Splits a fence's meta string into `key` flags and `key="value"` options. */
const tokenize = (meta: string) => {
  const options: Record<string, string | true> = {};
  OPTION.lastIndex = 0;
  while (OPTION.lastIndex < meta.length) {
    const start = OPTION.lastIndex;
    const match = OPTION.exec(meta);
    if (match === null) {
      return Effect.fail(optionError(meta, `cannot read the options from column ${start + 1}`));
    }
    const [, key, value] = match;
    if (key in options) return Effect.fail(optionError(meta, `${key} is given twice`));
    options[key] = value ?? true;
  }
  return Effect.succeed(options);
};

/** Decodes a fence's options; unknown options, an empty reason or both modes at once fail. */
export const decodeFenceOptions = (
  meta: string | null | undefined
): Effect.Effect<FenceMode, FenceOptionError> =>
  Effect.gen(function* () {
    const text = meta?.trim() ?? '';
    if (text === '') return CHECKED;
    const raw = yield* tokenize(text);
    const options = yield* Schema.decodeUnknownEffect(FenceOptions)(raw, {
      onExcessProperty: 'error',
    }).pipe(Effect.mapError(error => optionError(text, error.message)));
    if (options.signature && options.nocheck !== undefined) {
      return yield* optionError(text, 'a fence is either a signature or opted out, not both');
    }
    if (options.signature) return SIGNATURE;
    if (options.nocheck !== undefined) return { _tag: 'OptedOut', reason: options.nocheck };
    return CHECKED;
  });
