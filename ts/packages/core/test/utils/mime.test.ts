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
  // Extensions the mime package does not know, kept for parity with the Python SDK.
  const EXTENSIONS_UNKNOWN_TO_MIME = [
    '3gpp2',
    'ass',
    'h5',
    'ksh',
    'loas',
    'mpa',
    'nws',
    'ppa',
    'pwz',
    'py',
    'pyc',
    'tgz',
    'wiz',
    'xlb',
    'xpdl',
  ];
  const known = Object.fromEntries(
    Object.entries(MIME_TYPES_BY_EXTENSION).filter(
      ([extension]) => !EXTENSIONS_UNKNOWN_TO_MIME.includes(extension)
    )
  );

  it('matches the mime package for every extension it knows', () => {
    const fromMimePackage = Object.fromEntries(
      Object.keys(known).map(extension => [extension, mime.getType(`file.${extension}`)])
    );
    expect(fromMimePackage).toEqual(known);
  });

  it('adds only extensions the mime package does not know', () => {
    const fromMimePackage = EXTENSIONS_UNKNOWN_TO_MIME.map(extension =>
      mime.getType(`file.${extension}`)
    );
    expect(fromMimePackage).toEqual(EXTENSIONS_UNKNOWN_TO_MIME.map(() => null));
  });
});
