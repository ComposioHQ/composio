import { Effect } from 'effect';
import type { TerminalUI } from 'src/services/terminal-ui';

export const emitStreamLine = (line: string, ui: TerminalUI) =>
  Effect.gen(function* () {
    yield* ui.log.message(line);
    yield* ui.output(line, { force: true });
  });

export const formatStreamValue = (value: unknown): string => {
  if (value === undefined) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

export const formatStopMessage = (params: {
  matchingEvents: number;
  timedOut: boolean;
  temporaryTriggerDisabled: boolean;
}): string => {
  const eventLabel = `event${params.matchingEvents === 1 ? '' : 's'}`;
  if (params.timedOut) {
    return params.temporaryTriggerDisabled
      ? `Stopped after timeout with ${params.matchingEvents} matching ${eventLabel}. Temporary trigger disabled.`
      : `Stopped after timeout with ${params.matchingEvents} matching ${eventLabel}.`;
  }

  return params.temporaryTriggerDisabled
    ? `Stopped after receiving ${params.matchingEvents} ${eventLabel}. Temporary trigger disabled.`
    : `Stopped after receiving ${params.matchingEvents} ${eventLabel}.`;
};
