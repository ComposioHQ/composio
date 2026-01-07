/**
 * Path Validation Module
 *
 * Unified path validation for both proxy.ts and API routes.
 * Prevents path traversal and injection attacks.
 */

/**
 * Valid path prefixes for content access.
 * Used by both proxy and API routes.
 */
export const VALID_PATH_PREFIXES = [
  '/docs',
  '/tool-router',
  '/reference',
  '/examples',
] as const;

export type ValidPrefix = (typeof VALID_PATH_PREFIXES)[number];

/**
 * Result type for path validation
 */
export type ValidationResult =
  | { valid: true; path: string; prefix: ValidPrefix }
  | { valid: false; error: string };

/**
 * Fully decode a URL-encoded string, handling double/triple encoding.
 * Returns null if decoding fails (invalid encoding).
 */
function fullyDecode(str: string): string | null {
  let decoded = str;
  let previous = '';

  try {
    // Keep decoding until no more changes (handles double/triple encoding)
    // Limit iterations to prevent infinite loops
    let iterations = 0;
    const maxIterations = 5;

    while (decoded !== previous && iterations < maxIterations) {
      previous = decoded;
      decoded = decodeURIComponent(decoded);
      iterations++;
    }

    return decoded;
  } catch {
    // Invalid URL encoding
    return null;
  }
}

/**
 * Check for path traversal patterns
 */
function hasTraversalPattern(path: string): boolean {
  // Check various forms of path traversal
  const traversalPatterns = [
    '..', // Direct traversal
    '\\.\\.',  // Escaped dots (regex pattern not literal)
    '\0', // Null byte
  ];

  // Check for exact patterns
  for (const pattern of traversalPatterns) {
    if (path.includes(pattern)) {
      return true;
    }
  }

  // Check for unicode variants of dots and slashes
  const unicodeDots = [
    '\u002e', // .
    '\u2024', // One dot leader
    '\u2025', // Two dot leader
    '\ufe52', // Small full stop
    '\uff0e', // Fullwidth full stop
  ];

  // Check if two consecutive unicode dots exist
  for (let i = 0; i < path.length - 1; i++) {
    if (unicodeDots.includes(path[i]) && unicodeDots.includes(path[i + 1])) {
      return true;
    }
  }

  return false;
}

/**
 * Validate and sanitize a path for content access.
 *
 * Security measures:
 * - Full URL decoding (handles double encoding)
 * - Unicode normalization (NFC)
 * - Path traversal detection
 * - Prefix validation
 *
 * @param path - The path to validate
 * @returns Validation result with sanitized path or error
 */
export function validatePath(path: string | null | undefined): ValidationResult {
  // Null/empty check
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'Path is required' };
  }

  // Length check (prevent DoS with extremely long paths)
  if (path.length > 1000) {
    return { valid: false, error: 'Path too long' };
  }

  // Fully decode the path (handles %2e, %252e, etc.)
  const decoded = fullyDecode(path);
  if (decoded === null) {
    return { valid: false, error: 'Invalid path encoding' };
  }

  // Normalize unicode to NFC form
  const normalized = decoded.normalize('NFC');

  // Check for path traversal patterns
  if (hasTraversalPattern(normalized)) {
    return { valid: false, error: 'Invalid path' };
  }

  // Normalize slashes and case for prefix checking
  const cleanPath = normalized
    .replace(/\\/g, '/') // Convert backslashes
    .replace(/\/+/g, '/'); // Remove duplicate slashes

  const lowerPath = cleanPath.toLowerCase();

  // Find matching prefix
  const matchedPrefix = VALID_PATH_PREFIXES.find((prefix) =>
    lowerPath.startsWith(prefix)
  );

  if (!matchedPrefix) {
    return { valid: false, error: 'Invalid path prefix' };
  }

  // Return the cleaned (but not lowercased) path
  return {
    valid: true,
    path: cleanPath,
    prefix: matchedPrefix,
  };
}

/**
 * Validate path segments from Next.js dynamic route.
 * Reconstructs path and validates.
 *
 * @param segments - Array of path segments from [...path]
 * @returns Validation result
 */
export function validatePathSegments(
  segments: string[] | null | undefined
): ValidationResult {
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return { valid: false, error: 'Path segments required' };
  }

  // Check segment count (prevent DoS)
  if (segments.length > 20) {
    return { valid: false, error: 'Too many path segments' };
  }

  // Reconstruct path from segments
  const path = '/' + segments.join('/');

  return validatePath(path);
}

/**
 * Escape a string for safe use in YAML frontmatter.
 * Handles special characters, newlines, and injection attempts.
 */
export function escapeYaml(str: string): string {
  if (!str) return '""';

  // First check if escaping is needed
  const needsEscaping = /[:\n\r"'\\@&*#!|>[\]{},%?`]/.test(str);

  if (!needsEscaping) {
    return str;
  }

  // Escape special characters
  const escaped = str
    .replace(/\\/g, '\\\\') // Backslashes first
    .replace(/"/g, '\\"') // Double quotes
    .replace(/\n/g, '\\n') // Newlines
    .replace(/\r/g, '\\r') // Carriage returns
    .replace(/\t/g, '\\t'); // Tabs

  return `"${escaped}"`;
}
