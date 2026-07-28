import { describe, expect, it } from '@effect/vitest';
import { Option } from 'effect';
import { resolvePusherConstructor } from 'src/services/triggers-realtime';

/**
 * Regression tests for issue #3918: `composio listen` crashed with
 * `TypeError: Object is not a constructor` in compiled release binaries
 * because pusher-js 8.5.0 exports a namespace object
 * (`module.exports = { Pusher }`), so the dynamic import's `.default` is not
 * the constructor.
 */
describe('resolvePusherConstructor', () => {
  class FakePusher {}

  it('resolves the constructor from `module.default` (Node interop, running from source)', () => {
    expect(resolvePusherConstructor({ default: FakePusher })).toEqual(Option.some(FakePusher));
  });

  it('resolves the constructor from `module.default.default` (defensive double-wrapped interop)', () => {
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

  it('resolves a named `Pusher` export on the default namespace (pusher-js 8.5.0 shape, issue #3918)', () => {
    expect(
      resolvePusherConstructor({ default: { Pusher: FakePusher }, Pusher: FakePusher })
    ).toEqual(Option.some(FakePusher));
  });

  it('resolves a named `Pusher` export on the module itself', () => {
    expect(resolvePusherConstructor({ Pusher: FakePusher })).toEqual(Option.some(FakePusher));
  });

  it('resolves a `default.Pusher` namespace export without a top-level `Pusher` fallback', () => {
    expect(resolvePusherConstructor({ default: { Pusher: FakePusher } })).toEqual(
      Option.some(FakePusher)
    );
  });

  it('resolves the constructor from the real installed pusher-js module', async () => {
    const pusherModule = await import('pusher-js');
    const resolved = resolvePusherConstructor(pusherModule);
    expect(Option.isSome(resolved)).toBe(true);
  });

  it('returns none when no interop shape exposes a callable constructor', () => {
    expect(resolvePusherConstructor({ default: { default: 'not-a-function' } })).toEqual(
      Option.none()
    );
    expect(resolvePusherConstructor(undefined)).toEqual(Option.none());
  });
});
