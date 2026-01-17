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

  // Find matching prefix with boundary check
  // Ensures /docsextra doesn't match /docs - must be exact or followed by /
  const matchedPrefix = VALID_PATH_PREFIXES.find((prefix) => {
    if (!lowerPath.startsWith(prefix)) return false;
    // Check boundary: path must equal prefix or have / after it
    return lowerPath.length === prefix.length || lowerPath[prefix.length] === '/';
  });

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
 * YAML reserved words that must be quoted to prevent type coercion.
 * These are interpreted as boolean/null in YAML 1.1 and some parsers.
 */
const YAML_RESERVED_WORDS = new Set([
  // Boolean values (case variations)
  'true', 'false', 'yes', 'no', 'on', 'off',
  'True', 'False', 'Yes', 'No', 'On', 'Off',
  'TRUE', 'FALSE', 'YES', 'NO', 'ON', 'OFF',
  // Null values
  'null', 'Null', 'NULL', '~',
]);

/**
 * Escape a string for safe use in YAML frontmatter.
 * Handles special characters, newlines, reserved words, and numbers.
 */
export function escapeYaml(str: string): string {
  if (!str) return '""';

  // Check for special characters that need escaping
  const hasSpecialChars = /[:\n\r"'\\@&*#!|>[\]{},%?`]/.test(str);

  // Check if it's a YAML reserved word
  const isReservedWord = YAML_RESERVED_WORDS.has(str);

  // Check if it looks like a number (would be parsed as number instead of string)
  // Matches: integers, floats, scientific notation, hex, octal, infinity
  const looksLikeNumber = /^[-+]?(?:\d+\.?\d*|\d*\.?\d+)(?:[eE][-+]?\d+)?$/.test(str) ||
    /^0[xX][0-9a-fA-F]+$/.test(str) || // hex
    /^0[oO]?[0-7]+$/.test(str) || // octal
    /^[-+]?(?:\.inf|\.Inf|\.INF)$/.test(str) || // infinity
    /^(?:\.nan|\.NaN|\.NAN)$/.test(str); // NaN

  // Check if starts with special indicator characters
  const startsWithIndicator = /^[-?:,[\]{}#&*!|>'"%@`]/.test(str);

  if (!hasSpecialChars && !isReservedWord && !looksLikeNumber && !startsWithIndicator) {
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
