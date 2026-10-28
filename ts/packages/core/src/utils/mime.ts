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
    'application/octet-stream': 'bin',
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

  // An own property only: `constructor` or `__proto__` must not reach Object.prototype.
  if (Object.hasOwn(mimeToExt, cleanMimeType)) {
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

// A local file has no Content-Type of its own, so its MIME type is inferred from
// its name's extension, as the Python SDK does (`composio.utils.mimetypes.guess`).
// Tools validate the `mimetype` of an uploaded file (Canva's design import rejects
// `application/octet-stream`, issue #4984), so the generic type is a last resort.
export const DEFAULT_MIME_TYPE = 'application/octet-stream';

// Extension (lowercase, no leading dot) -> MIME type. Each value matches the
// `mime` package, which the CLI's `composio execute` uses for the same files.
export const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  odg: 'application/vnd.oasis.opendocument.graphics',
  key: 'application/vnd.apple.keynote',
  numbers: 'application/vnd.apple.numbers',
  pages: 'application/vnd.apple.pages',
  rtf: 'application/rtf',
  epub: 'application/epub+zip',
  ai: 'application/postscript',
  eps: 'application/postscript',
  psd: 'image/vnd.adobe.photoshop',
  // Text and data
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  ics: 'text/calendar',
  eml: 'message/rfc822',
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  ico: 'image/vnd.microsoft.icon',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  // Audio and video
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/x-flac',
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  webm: 'video/webm',
  // Archives
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  '7z': 'application/x-7z-compressed',
};

/**
 * The MIME type of a file, from its name's extension; `application/octet-stream`
 * when the extension is missing or unknown. Accepts a bare name or a path.
 *
 * @example getMimeTypeFromFileName('/tmp/deck.pptx') // 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
 */
export const getMimeTypeFromFileName = (fileName: string): string => {
  const baseName = fileName.split(/[\\/]/).pop() ?? '';
  const dot = baseName.lastIndexOf('.');
  // A leading dot is a hidden file's name (`.env`), not an extension.
  if (dot <= 0) return DEFAULT_MIME_TYPE;
  const extension = baseName.slice(dot + 1).toLowerCase();
  // An own property only: `report.constructor` must not reach Object.prototype.
  return Object.hasOwn(MIME_TYPES_BY_EXTENSION, extension)
    ? MIME_TYPES_BY_EXTENSION[extension]
    : DEFAULT_MIME_TYPE;
};
