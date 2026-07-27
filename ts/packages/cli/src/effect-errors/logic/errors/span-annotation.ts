import { hasProperty, isString, isTagged } from 'effect/Predicate';
import type { Span } from 'effect/Tracer';

// Effect v3 internal: `Effect.fail`/`Effect.die` proxy object errors so the
// fiber's current span is readable under this global registry symbol. There is
// no public API for it, and `Symbol.for` succeeds even on Effect versions that
// stop setting it, so keep every read behind this adapter — the canary test in
// test/src/effect-errors/span-annotation.test.ts breaks loudly when an
// `effect` upgrade drops the mechanism.
const spanSymbol = Symbol.for('effect/SpanAnnotation');

const looksLikeSpan = (value: unknown): value is Span =>
  isTagged(value, 'Span') &&
  hasProperty(value, 'name') &&
  isString(value.name) &&
  hasProperty(value, 'status') &&
  hasProperty(value, 'attributes') &&
  hasProperty(value, 'parent');

export const extractSpanAnnotation = (error: unknown): Span | undefined => {
  if (!hasProperty(error, spanSymbol)) {
    return undefined;
  }

  const value = error[spanSymbol];
  return looksLikeSpan(value) ? value : undefined;
};
