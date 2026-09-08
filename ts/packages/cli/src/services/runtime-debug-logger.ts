import { Effect } from 'effect';
import { isPerfDebugEnabled, isToolDebugEnabled } from 'src/services/runtime-flags';
import { TerminalUI } from 'src/services/terminal-ui';

const writeJsonDebugLine = (channel: string, payload: Record<string, unknown>) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    yield* ui.error(`[${channel}] ${JSON.stringify(payload)}`);
  });

export const logToolDebug = (label: string, details: Record<string, unknown> = {}) =>
  Effect.flatMap(isToolDebugEnabled, enabled =>
    enabled ? writeJsonDebugLine('tool-debug', { label, ...details }) : Effect.void
  );

export const makePerfDebugLogger =
  (startedAt: number = Date.now()) =>
  (label: string, details: Record<string, unknown> = {}) =>
    Effect.flatMap(isPerfDebugEnabled, enabled =>
      enabled
        ? writeJsonDebugLine('perf', {
            phase: 'event',
            label,
            elapsedMs: Date.now() - startedAt,
            ...details,
          })
        : Effect.void
    );
