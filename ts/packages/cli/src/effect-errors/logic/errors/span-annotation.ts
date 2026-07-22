import { type Reason, reasonAnnotations, StackTrace } from 'effect/Cause';
import { getOrUndefined } from 'effect/Context';

import type { ErrorSpan } from 'effect-errors/types';

// v3 internal: `Effect.fail`/`Effect.die` proxied object errors so the fiber's
// current span was readable under a global `effect/SpanAnnotation` registry
// symbol. v4 dropped that mechanism entirely (confirmed against
// `ts/vendor/effect` — no such symbol, and no per-reason span stamped directly
// onto the raised error value anywhere in the v4 source or the installed
// `effect@4.0.0-beta.99` dist).
//
// The analogous v4 mechanism lives one level up, on the `Cause` `Reason`
// rather than the bare error value: `Effect.withSpan` pushes a span-named
// `StackFrame` onto the `CurrentStackFrame` fiber reference (vendored
// `internal/effect.ts`'s `provideSpanStackFrame`, used by
// `withParentSpan`/`withSpan`), and on failure the runtime annotates every
// reason with that frame chain under the `Cause.StackTrace` context key —
// `Context.get(Cause.reasonAnnotations(reason), Cause.StackTrace)`. Frames
// form a linked list (`{ name, stack(), parent }`), innermost span first.
//
// Only names and call-site locations survive this way: the old v3 span
// timeline's per-span duration/attributes lived on the `Span` object itself,
// which no longer exists by the time a `Cause` is inspected, so timing cannot
// be recovered — see the canary tests in
// test/src/effect-errors/span-annotation.test.ts, which confirm this chain is
// populated for both `Effect.fail` and `Effect.die`.
export const extractSpanStackFrames = (reason: Reason<unknown>): ReadonlyArray<ErrorSpan> => {
  const frames: ErrorSpan[] = [];
  let frame = getOrUndefined(reasonAnnotations(reason), StackTrace);

  while (frame !== undefined) {
    frames.push({ name: frame.name, location: frame.stack() });
    frame = frame.parent;
  }

  return frames;
};
