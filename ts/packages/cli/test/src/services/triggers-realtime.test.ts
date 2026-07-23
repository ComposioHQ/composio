import { describe, expect, it } from '@effect/vitest';
import { Option } from 'effect';
import { resolvePusherConstructor } from 'src/services/triggers-realtime';

/**
 * Regression tests for issue #3918: `composio listen` crashed with
 * `TypeError: Object is not a constructor` in compiled release binaries
 * because the Bun bundler's CJS interop exposes the pusher-js constructor at
 * `module.default.default` instead of `module.default`.
 */
describe('resolvePusherConstructor', () => {
  class FakePusher {}

  it('resolves the constructor from `module.default` (Node interop, running from source)', () => {
    expect(resolvePusherConstructor({ default: FakePusher })).toEqual(Option.some(FakePusher));
  });

  it('resolves the constructor from `module.default.default` (Bun-bundled binary interop, issue #3918)', () => {
    expect(resolvePusherConstructor({ default: { default: FakePusher } })).toEqual(
      Option.some(FakePusher)
    );
  });

  it('prefers the nested constructor when both interop levels are callable', () => {
    const outer = Object.assign(function outer() {}, { default: FakePusher });
    expect(resolvePusherConstructor({ default: outer })).toEqual(Option.some(FakePusher));
  });

  it('falls back to the module object itself when it is the constructor', () => {
    expect(resolvePusherConstructor(FakePusher)).toEqual(Option.some(FakePusher));
  });

  it('resolves a named `Pusher` export on the default namespace (bun-linux-x64 compiled interop, issue #3918)', () => {
    expect(
      resolvePusherConstructor({ default: { Pusher: FakePusher }, Pusher: FakePusher })
    ).toEqual(Option.some(FakePusher));
  });

  it('resolves a named `Pusher` export on the module itself', () => {
    expect(resolvePusherConstructor({ Pusher: FakePusher })).toEqual(Option.some(FakePusher));
  });

  it('returns none when no interop shape exposes a callable constructor', () => {
    expect(resolvePusherConstructor({ default: { default: 'not-a-function' } })).toEqual(
      Option.none()
    );
    expect(resolvePusherConstructor(undefined)).toEqual(Option.none());
  });
});
