import { describe, expect, it } from 'vitest';
import * as z4 from 'zod/v4';
import { version } from 'zod/v4/core';

import { ZOD_V4_FLOOR, meetsZodV4Floor } from '../../src/backend/zod-v4-floor';

describe('v4 registry', () => {
  it('shares the global registry through globalThis', () => {
    expect((globalThis as { __zod_globalRegistry?: unknown }).__zod_globalRegistry).toBe(
      z4.globalRegistry
    );
  });

  it('runs on a copy that meets the floor', () => {
    expect(meetsZodV4Floor(version)).toBe(true);
    expect(meetsZodV4Floor(ZOD_V4_FLOOR)).toBe(true);
    expect(meetsZodV4Floor({ major: 4, minor: 1, patch: 12 })).toBe(false);
    expect(meetsZodV4Floor({ major: 4, minor: 0, patch: 0 })).toBe(false);
    expect(meetsZodV4Floor({ major: 5, minor: 0, patch: 0 })).toBe(true);
  });
});
