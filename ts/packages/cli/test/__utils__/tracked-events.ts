import { Effect } from 'effect';
import type { TrackEvent } from 'src/analytics/types';

export const trackedEvents: Array<NonNullable<TrackEvent>> = [];

export const eventsNamed = (name: string) => trackedEvents.filter(event => event.name === name);

export const recordTrackedEvent = (event: TrackEvent) =>
  Effect.sync(() => {
    if (event) trackedEvents.push(event);
  });
