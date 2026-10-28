import mime from 'mime';
import { describe, it, expect } from 'vitest';
import { getExtensionFromMimeType, MIME_TYPES_BY_EXTENSION } from '../../src/utils/mime';

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

// The CLI's `composio execute` labels local files with the `mime` package, so the
// SDK must send the same type for the same extension.
describe('MIME_TYPES_BY_EXTENSION', () => {
  it('matches the mime package for every extension', () => {
    const fromMimePackage = Object.fromEntries(
      Object.keys(MIME_TYPES_BY_EXTENSION).map(extension => [
        extension,
        mime.getType(`file.${extension}`),
      ])
    );
    expect(fromMimePackage).toEqual(MIME_TYPES_BY_EXTENSION);
  });
});
