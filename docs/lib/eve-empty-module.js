// Browser stub for `node:module`. eve's bundled rolldown CJS-interop helper
// has a bare, unused `import "node:module"` that Turbopack can't put in a
// browser chunk. Nothing reads from it, so an empty module is safe.
export {};
