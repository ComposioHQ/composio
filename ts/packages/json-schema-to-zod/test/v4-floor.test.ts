import { describe, expect, it } from 'vitest';
import { version } from 'zod/v4/core';

describe('the /v4 entry below the zod floor', () => {
  it('refuses to load and names the floor', async () => {
    expect(version).toEqual({ major: 4, minor: 0, patch: 0 });
    await expect(import('../src/v4')).rejects.toThrow(
      '@composio/json-schema-to-zod/v4 requires zod >= 4.1.13; found 4.0.0'
    );
  });
});
