/**
 * Compatibility layer for Zod 3 and Zod 4
 *
 * This module provides a unified API that works with both Zod 3 and Zod 4.
 * Following the official guidance from https://zod.dev/library-authors
 */

// Import from the recommended subpaths
import * as z3 from 'zod/v3';
import * as z4Core from 'zod/v4/core';

// Try to import the full Zod 4 API if available
// Note: According to the guidance, we should use zod/v4/core, but for creating schemas
// we need the full API. We'll try to import from zod/v4, but fall back to z3 if not available.
// We use a lazy import approach - check at runtime which version is available
let z4: typeof z3 | undefined;
let z4Checked = false;

function getZ4(): typeof z3 | undefined {
  if (z4Checked) {
    return z4;
  }
  z4Checked = true;
  try {
    // In Zod 4, zod/v4 exists and exports the full API
    // We need this for creating schemas (z.string(), z.object(), etc.)
    // Use dynamic import to check if it's available
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    z4 = require('zod/v4') as typeof z3;
  } catch {
    // Zod 4 not available, will use z3
    z4 = undefined;
  }
  return z4;
}

// Re-export both versions
export { z3, z4Core };

// Union type that accepts schemas from both Zod 3 and Zod 4
// For type purposes, we use z3.ZodTypeAny as the base since it has all the methods
// At runtime, the schemas will work with both versions
export type ZodTypeAny = z3.ZodTypeAny;

// Helper to check if a schema is from Zod 4
// Note: At runtime, Zod 4 schemas will have _zod property, but for type purposes
// we treat everything as z3.ZodTypeAny since they're compatible
export function isZodV4(schema: ZodTypeAny): boolean {
  return '_zod' in schema;
}

// Helper to detect which version of Zod is installed at runtime
function detectZodVersion(): 'v3' | 'v4' {
  // Check if z4 is available and actually works
  const z4Instance = getZ4();
  if (z4Instance) {
    try {
      const testSchema = z4Instance.string();
      // Zod 4 schemas have _zod property, Zod 3 have _def
      if ('_zod' in testSchema) {
        return 'v4';
      }
    } catch {
      // Fall through to v3
    }
  }
  return 'v3';
}

// Get the appropriate zod instance for creating schemas
// This will use the version that's actually installed at runtime
// We detect lazily at first use
let cachedZ: typeof z3 | undefined;
function getZ(): typeof z3 {
  if (cachedZ) {
    return cachedZ;
  }
  const detectedVersion = detectZodVersion();
  cachedZ = (detectedVersion === 'v4' && getZ4() ? getZ4()! : z3) as typeof z3;
  return cachedZ;
}

// Export z as a getter that returns the appropriate version
// This ensures we always use the correct version at runtime
export const z = new Proxy({} as typeof z3, {
  get(_target, prop) {
    return getZ()[prop as keyof typeof z3];
  },
}) as typeof z3;
