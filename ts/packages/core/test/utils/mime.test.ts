import { describe, it, expect } from 'vitest';
import { getExtensionFromMimeType } from '../../src/utils/mime';

describe('getExtensionFromMimeType', () => {
  it('should return extension for known mimetype', () => {
    expect(getExtensionFromMimeType('image/png')).toBe('png');
    expect(getExtensionFromMimeType('application/pdf')).toBe('pdf');
  });
});
