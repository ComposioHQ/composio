import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Layer, Option } from 'effect';
import { AuthRejectionRecorder } from 'src/services/auth-rejection';

// A second service built on the recorder, to check that both see one instance.
class Probe extends Context.Service<
  Probe,
  { readonly first: AuthRejectionRecorder['Service']['first'] }
>()('test/Probe') {}

describe('AuthRejectionRecorder', () => {
  it.effect('[Given] nothing recorded [Then] reports none', () =>
    Effect.gen(function* () {
      const recorder = yield* AuthRejectionRecorder;
      expect(Option.isNone(yield* recorder.first)).toBe(true);
    }).pipe(Effect.provide(AuthRejectionRecorder.Default))
  );

  it.effect('[Given] several rejections [Then] keeps the first', () =>
    Effect.gen(function* () {
      const recorder = yield* AuthRejectionRecorder;
      yield* recorder.record({
        baseURL: 'https://staging-backend.composio.dev',
        keySource: 'stored',
      });
      yield* recorder.record({ baseURL: 'https://backend.composio.dev', keySource: 'env' });

      expect(yield* recorder.first).toEqual(
        Option.some({ baseURL: 'https://staging-backend.composio.dev', keySource: 'stored' })
      );
    }).pipe(Effect.provide(AuthRejectionRecorder.Default))
  );

  it.effect('[Given] the layer is provided twice by reference [Then] both share one recorder', () =>
    Effect.gen(function* () {
      const recorder = yield* AuthRejectionRecorder;
      yield* recorder.record({ baseURL: 'https://backend.composio.dev', keySource: 'stored' });
      const fromDependent = yield* Effect.flatMap(Probe, probe => probe.first);
      expect(Option.isSome(fromDependent)).toBe(true);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          AuthRejectionRecorder.Default,
          Layer.effect(
            Probe,
            Effect.map(AuthRejectionRecorder, recorder => ({ first: recorder.first }))
          ).pipe(Layer.provide(AuthRejectionRecorder.Default))
        )
      )
    )
  );
});
