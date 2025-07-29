import { Effect, pipe } from 'effect';

import { removeNodeModulesEntriesFromStack } from 'effect-errors/logic/spans';

import { maybeMapSourcemaps } from './maybe-map-sourcemaps';

export const getSourcesFromStack = (maybeStack: string | undefined) =>
  pipe(
    Effect.gen(function* () {
      if (maybeStack === undefined) {
        return {
          sources: [],
          location: [],
        };
      }

      const relevantStackEntries = removeNodeModulesEntriesFromStack(maybeStack);
      const sourcesOrLocation = yield* maybeMapSourcemaps('', relevantStackEntries);

      return {
        sources: sourcesOrLocation.filter(el => el._tag === 'sources'),
        location: sourcesOrLocation.filter(el => el._tag === 'location'),
      };
    }),
    Effect.withSpan('get-sources-from-stack')
  );
