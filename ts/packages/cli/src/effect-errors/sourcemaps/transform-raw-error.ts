import { Effect, Struct, pipe } from 'effect';

import { stripCwdPath } from 'effect-errors/logic/path';
import { stackAtRegex } from 'effect-errors/logic/stack';

import type { CaptureErrorsOptions } from '../capture-errors';
import type { PrettyError } from '../types/pretty-error.type';
import { getSourcesFromSpan } from './get-sources-from-span';
import { getSourcesFromStack } from './get-sources-from-stack';

const dropTag = Struct.omit('_tag');

export const transformRawError =
  ({ stripCwd }: CaptureErrorsOptions) =>
  ({ message, stack: maybeStack, span, errorType, isPlainString }: PrettyError) =>
    pipe(
      Effect.gen(function* () {
        const data = yield* getSourcesFromStack(maybeStack);
        const { spans, sources, location } = yield* getSourcesFromSpan({
          span,
          ...data,
        });

        let stack: string | undefined;
        if (maybeStack !== undefined) {
          stack = stripCwd === true ? stripCwdPath(maybeStack) : maybeStack;
        }

        return {
          errorType,
          message,
          stack: stack?.replaceAll(stackAtRegex, 'at ').split('\r\n'),
          // `Struct.omit` returns a plain object, dropping the `Data` prototype
          // along with the tag: these values leave the source-map layer here.
          sources: sources.length > 0 ? sources.map(dropTag) : undefined,
          location: location.length > 0 ? location.map(dropTag) : undefined,
          spans,
          isPlainString,
        };
      }),
      Effect.withSpan('transform-raw-error')
    );
