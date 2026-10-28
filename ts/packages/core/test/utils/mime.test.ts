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
  const EXTENSIONS_UNKNOWN_TO_MIME = { py: 'text/x-python', tgz: 'application/gzip' };

  it('matches the mime package for every extension it knows', () => {
    const { py: _py, tgz: _tgz, ...known } = MIME_TYPES_BY_EXTENSION;
    const fromMimePackage = Object.fromEntries(
      Object.keys(known).map(extension => [extension, mime.getType(`file.${extension}`)])
    );
    expect(fromMimePackage).toEqual(known);
  });

  it('adds only extensions the mime package does not know', () => {
    expect(mime.getType('file.py')).toBeNull();
    expect(mime.getType('file.tgz')).toBeNull();
    expect({
      py: MIME_TYPES_BY_EXTENSION.py,
      tgz: MIME_TYPES_BY_EXTENSION.tgz,
    }).toEqual(EXTENSIONS_UNKNOWN_TO_MIME);
  });
});
