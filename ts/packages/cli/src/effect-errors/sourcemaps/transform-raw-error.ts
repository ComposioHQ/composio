import { Effect, pipe } from 'effect';

import { stripCwdPath } from 'effect-errors/logic/path';
import { stackAtRegex } from 'effect-errors/logic/stack';

import type { CaptureErrorsOptions } from '../capture-errors';
import type { PrettyError } from '../types/pretty-error.type';
import { getSourcesFromStack } from './get-sources-from-stack';

export const transformRawError =
  ({ stripCwd }: CaptureErrorsOptions) =>
  ({ message, stack: maybeStack, spans, errorType, isPlainString }: PrettyError) =>
    pipe(
      Effect.gen(function* () {
        // v4 has no `Span` object on a `Cause` to source-map (see
        // `logic/errors/span-annotation.ts`), so `sources`/`location` can only
        // ever come from the raw Node stack, not from span attributes anymore.
        const { sources, location } = yield* getSourcesFromStack(maybeStack);

        let stack: string | undefined;
        if (maybeStack !== undefined) {
          stack = stripCwd === true ? stripCwdPath(maybeStack) : maybeStack;
        }

        return {
          errorType,
          message,
          stack: stack?.replaceAll(stackAtRegex, 'at ').split('\r\n'),
          sources: sources.length > 0 ? sources.map(({ _tag, ...data }) => data) : undefined,
          location: location.length > 0 ? location.map(({ _tag, ...data }) => data) : undefined,
          spans,
          isPlainString,
        };
      }),
      Effect.withSpan('transform-raw-error')
    );
