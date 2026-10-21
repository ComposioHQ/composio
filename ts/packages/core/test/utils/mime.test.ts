import { describe, it, expect } from 'vitest';
import { getExtensionFromMimeType } from '../../src/utils/mime';

describe('getExtensionFromMimeType', () => {
  it('should return extension for known mimetype', () => {
    expect(getExtensionFromMimeType('image/png')).toBe('png');
    expect(getExtensionFromMimeType('application/pdf')).toBe('pdf');
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'does not return an Object.prototype member for %j',
    mimeType => {
      expect(getExtensionFromMimeType(mimeType)).toBe('bin');
    }
  );
});
