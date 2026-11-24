import { Data, Effect } from 'effect';

export type FenceMode =
  | { readonly _tag: 'Checked' }
  | { readonly _tag: 'Signature' }
  | { readonly _tag: 'OptedOut'; readonly reason: string };

const CHECKED: FenceMode = { _tag: 'Checked' };
const SIGNATURE: FenceMode = { _tag: 'Signature' };
const NOCHECK = /^nocheck="([^"]*)"$/;

export class FenceOptionError extends Data.TaggedError('FenceOptionError')<{
  readonly message: string;
}> {}

const optionError = (meta: string, problem: string) =>
  new FenceOptionError({ message: `Invalid fence options \`${meta}\`: ${problem}` });

export const decodeFenceOptions = (
  meta: string | null | undefined
): Effect.Effect<FenceMode, FenceOptionError> => {
  const text = meta?.trim() ?? '';
  if (text === '') return Effect.succeed(CHECKED);
  if (text === 'signature') return Effect.succeed(SIGNATURE);
  const nocheck = NOCHECK.exec(text);
  if (nocheck !== null) {
    const reason = nocheck[1] ?? '';
    if (!/\S/.test(reason)) {
      return Effect.fail(optionError(text, 'nocheck needs a non-empty reason'));
    }
    return Effect.succeed({ _tag: 'OptedOut', reason });
  }
  return Effect.fail(
    optionError(text, 'expected `signature` or `nocheck="<non-empty reason>"`')
  );
};
