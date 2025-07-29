import { Effect, Option, pipe } from 'effect';
import type { AnySpan, Span } from 'effect/Tracer';

import { splitSpansAttributesByTypes } from 'effect-errors/logic/spans';

import type { ErrorRelatedSources, RawErrorLocation } from './get-sources-from-map-file';
import { maybeMapSourcemaps } from './maybe-map-sourcemaps';

export const getSourcesFromSpan = ({
  span,
  sources,
  location,
}: {
  span: Span | undefined;
  sources: ErrorRelatedSources[];
  location: RawErrorLocation[];
}) =>
  pipe(
    Effect.gen(function* () {
      if (span === undefined) {
        return {
          spans: [],
          sources,
          location,
        };
      }

      const spans = [];

      let current: Span | AnySpan | undefined = span;
      while (current !== undefined && current._tag === 'Span') {
        const { name, attributes: allAttributes, status } = current;

        const { attributes, stacktrace } = splitSpansAttributesByTypes(allAttributes);

        const sourcesOrLocation = yield* maybeMapSourcemaps(name, stacktrace);
        const duration =
          status._tag === 'Ended'
            ? +`${(status.endTime - status.startTime) / BigInt(1000000)}`
            : undefined;

        sources.push(...sourcesOrLocation.filter(el => el._tag === 'sources'));
        location.push(...sourcesOrLocation.filter(el => el._tag === 'location'));
        spans.push({
          name,
          attributes: Object.fromEntries(attributes),
          durationInMilliseconds: duration,
          startTime: status.startTime,
          endTime: status._tag === 'Ended' ? status.endTime : undefined,
        });

        current = Option.getOrUndefined(current.parent);
      }

      return {
        spans,
        location,
        sources,
      };
    }),
    Effect.withSpan('get-sources-from-span')
  );
