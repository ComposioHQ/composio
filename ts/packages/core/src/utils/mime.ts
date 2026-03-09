/**
 * Magic bytes (file signatures) for common formats.
 * Order matters: longer/more specific signatures should come first.
 */
const MAGIC_SIGNATURES: Array<{ bytes: number[]; mime: string }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png' },
  { bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mime: 'image/gif' },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mime: 'image/gif' },
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' }, // RIFF - need to check WEBP at 8
  { bytes: [0x42, 0x4d], mime: 'image/bmp' },
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },
  { bytes: [0x50, 0x4b, 0x03, 0x04], mime: 'application/zip' },
  { bytes: [0x50, 0x4b, 0x05, 0x06], mime: 'application/zip' },
  { bytes: [0x50, 0x4b, 0x07, 0x08], mime: 'application/zip' },
  { bytes: [0x1f, 0x8b], mime: 'application/gzip' },
  { bytes: [0x3c, 0x3f, 0x78, 0x6d, 0x6c], mime: 'application/xml' },
  { bytes: [0x3c, 0x73, 0x76, 0x67], mime: 'image/svg+xml' },
];

/**
 * Detects MIME type from buffer content using magic bytes (file signatures).
 * Returns the detected mimetype or null if unknown.
 *
 * @param buffer - ArrayBuffer or Uint8Array to inspect
 * @returns Detected mimetype or null
 */
export function detectMimeTypeFromBuffer(buffer: ArrayBuffer | Uint8Array): string | null {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  if (bytes.length === 0) return null;

  for (const { bytes: sig, mime } of MAGIC_SIGNATURES) {
    if (sig.length > bytes.length) continue;
    const matches = sig.every((b, i) => bytes[i] === b);
    if (!matches) continue;

    if (mime === 'image/webp' && bytes.length >= 12) {
      const webp = [0x57, 0x45, 0x42, 0x50];
      if (!webp.every((b, i) => bytes[8 + i] === b)) continue;
    }
    return mime;
  }
  return null;
}

/**
 * Maps MIME types to file extensions.
 * Used when deriving filenames from content-type headers (e.g. for URLs without path segments).
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'text/plain': 'txt',
    'text/html': 'html',
    'text/css': 'css',
    'text/javascript': 'js',
    'application/json': 'json',
    'application/xml': 'xml',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/gzip': 'gz',
    'application/x-tar': 'tar',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/mpeg': 'mpeg',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/webm': 'webm',
  };

  const cleanMimeType = mimeType.split(';')[0].toLowerCase().trim();

  if (mimeToExt[cleanMimeType]) {
    return mimeToExt[cleanMimeType];
  }

  const parts = cleanMimeType.split('/');
  if (parts.length === 2) {
    const subtype = parts[1].toLowerCase();

    if (subtype.includes('+')) {
      const plusParts = subtype.split('+');
      const prefix = plusParts[0];
      const suffix = plusParts[plusParts.length - 1];

      const knownPrefixes = ['svg', 'atom', 'rss'];
      if (knownPrefixes.includes(prefix)) {
        return prefix;
      }

      const structuredSuffixes = ['json', 'xml', 'yaml', 'zip', 'gzip'];
      if (structuredSuffixes.includes(suffix)) {
        return suffix;
      }

      return suffix;
    }

    return subtype || 'txt';
  }

  return 'bin';
}
