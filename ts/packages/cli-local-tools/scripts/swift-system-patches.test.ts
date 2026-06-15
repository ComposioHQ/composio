import { describe, expect, it } from 'vitest';
import { patchSwiftSystemAtResolveBeneathGuardInSource } from './swift-system-patches';

describe('swift-system build patches', () => {
  it('narrows AT_RESOLVE_BENEATH availability to FreeBSD', () => {
    const source = `#if canImport(Darwin, _version: 346) || os(FreeBSD)
@_alwaysEmitIntoClient
internal var _AT_RESOLVE_BENEATH: CInt { AT_RESOLVE_BENEATH }
#endif
`;

    const patched = patchSwiftSystemAtResolveBeneathGuardInSource(
      source,
      'Sources/System/Internals/Constants.swift'
    );

    expect(patched.replacementCount).toBe(1);
    expect(patched.source).toContain('#if os(FreeBSD)');
    expect(patched.source).not.toContain('canImport(Darwin, _version: 346)');
  });

  it('is idempotent for already patched sources', () => {
    const source = `#if os(FreeBSD)
@_alwaysEmitIntoClient
internal var _AT_RESOLVE_BENEATH: CInt { AT_RESOLVE_BENEATH }
#endif
`;

    const patched = patchSwiftSystemAtResolveBeneathGuardInSource(
      source,
      'Sources/System/Internals/Constants.swift'
    );

    expect(patched).toEqual({ source, replacementCount: 0 });
  });
});
