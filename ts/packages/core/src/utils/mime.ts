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
