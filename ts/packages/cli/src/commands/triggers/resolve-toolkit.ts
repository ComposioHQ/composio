import { Cache, Effect } from 'effect';
import { toolkitFromToolSlug } from 'src/effects/toolkit-from-tool-slug';
import type {
  ComposioToolkitsRepository,
  ToolkitProjectScope,
} from 'src/services/composio-clients';
import type { ToolkitSlugCatalog } from 'src/services/toolkit-slug-catalog';
import { guessToolkitFromToolSlug } from 'src/utils/toolkit-from-tool-slug';
import type { TriggerListenEvent } from './types';

/**
 * Distinct trigger slugs a listener resolves. A project has far fewer active
 * trigger types than this; past it, the oldest entry is resolved again.
 */
const CAPACITY = 1024;

/**
 * Builds a function that sets an event's toolkit from its trigger slug.
 *
 * Trigger payloads carry no toolkit slug, so `parseTriggerListenEvent` takes
 * the trigger slug's first `_` segment, which is wrong for toolkits whose slug
 * contains an underscore (`ONE_DRIVE_FILE_CREATED_TRIGGER` gives `ONE`). This
 * resolves the longest known toolkit prefix instead, through
 * {@link toolkitFromToolSlug}, so `GOOGLE_ANALYTICS_*` belongs to
 * `google_analytics` and never to `google`.
 *
 * Each distinct trigger slug is resolved once per listener. Only a toolkit
 * that was guessed from the trigger slug is replaced; a payload that names its
 * toolkit (legacy `appName`) keeps it.
 */
export const makeTriggerToolkitResolver = (
  scope?: ToolkitProjectScope
): Effect.Effect<
  (event: TriggerListenEvent) => Effect.Effect<TriggerListenEvent>,
  never,
  ComposioToolkitsRepository | ToolkitSlugCatalog
> =>
  Effect.gen(function* () {
    const toolkits = yield* Cache.make({
      capacity: CAPACITY,
      lookup: (triggerSlug: string) => toolkitFromToolSlug(triggerSlug, scope),
    });

    return event => {
      if (event.toolkitSlug.toLowerCase() !== guessToolkitFromToolSlug(event.triggerSlug)) {
        return Effect.succeed(event);
      }
      return Cache.get(toolkits, event.triggerSlug.toUpperCase()).pipe(
        Effect.map(toolkitSlug =>
          toolkitSlug === undefined
            ? event
            : { ...event, toolkitSlug, metadata: { ...event.metadata, toolkitSlug } }
        )
      );
    };
  });
