import { Effect } from 'effect';
import type { TerminalUI } from 'src/services/terminal-ui';
import { escapeTerminalText } from 'src/ui/escape-terminal-text';

/**
 * Emits one listener record on decorated stderr and on stdout. Event data in `line` can carry
 * controls and line breaks, so the line is escaped once for both sinks and stays one record;
 * the saved payload file keeps the original values.
 */
export const emitStreamLine = (line: string, ui: TerminalUI) =>
  Effect.gen(function* () {
    const record = escapeTerminalText(line);
    yield* ui.log.message(record);
    yield* ui.output(record, { force: true });
  });

/** The text of a `stream:` value: strings as they are, anything else as compact JSON. */
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
