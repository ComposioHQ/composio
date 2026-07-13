import { describe, expect, it } from 'vitest';
import { getRandomShortId, getRandomUUID } from '../../src/utils/uuid';

describe('UUID utilities', () => {
  it('generates UUID v4 values', () => {
    expect(getRandomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('generates eight-character URL-safe identifiers', () => {
    expect(getRandomShortId()).toMatch(/^[A-Za-z0-9_-]{8}$/);
  });
});
