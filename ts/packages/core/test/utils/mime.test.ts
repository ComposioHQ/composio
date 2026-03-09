import { describe, it, expect } from 'vitest';
import { detectMimeTypeFromBuffer, getExtensionFromMimeType } from '../../src/utils/mime';

describe('detectMimeTypeFromBuffer', () => {
  it('should detect PNG from magic bytes', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);
    expect(detectMimeTypeFromBuffer(png)).toBe('image/png');
  });

  it('should detect JPEG from magic bytes', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(detectMimeTypeFromBuffer(jpeg)).toBe('image/jpeg');
  });

  it('should detect PDF from magic bytes', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(detectMimeTypeFromBuffer(pdf)).toBe('application/pdf');
  });

  it('should detect ZIP from magic bytes', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
    expect(detectMimeTypeFromBuffer(zip)).toBe('application/zip');
  });

  it('should detect WebP from magic bytes', () => {
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectMimeTypeFromBuffer(webp)).toBe('image/webp');
  });

  it('should return null for unknown format', () => {
    const unknown = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(detectMimeTypeFromBuffer(unknown)).toBeNull();
  });

  it('should return null for empty buffer', () => {
    expect(detectMimeTypeFromBuffer(new Uint8Array(0))).toBeNull();
  });

  it('should work with ArrayBuffer', () => {
    const ab = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
    expect(detectMimeTypeFromBuffer(ab)).toBe('image/png');
  });
});

describe('getExtensionFromMimeType', () => {
  it('should return extension for known mimetype', () => {
    expect(getExtensionFromMimeType('image/png')).toBe('png');
    expect(getExtensionFromMimeType('application/pdf')).toBe('pdf');
  });
});
