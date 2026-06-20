/**
 * CommonJS require(esm) interop test for @composio/core.
 *
 * This fixture intentionally uses CommonJS syntax while resolving the ESM-only
 * package entrypoint through Node.js 22 native require(esm) support.
 */

'use strict';

const assert = require('node:assert');
const path = require('node:path');

console.log('Testing CommonJS require(esm) interop for @composio/core...\n');

console.log('Test 1: Node.js require(esm) support should be available...');
assert.strictEqual(
  process.features.require_module,
  true,
  'Node.js require(esm) support should be enabled'
);
console.log('Test 1 passed: require(esm) is available\n');

console.log('Test 2: require.resolve("@composio/core") should use the ESM entrypoint...');
const resolvedPath = require.resolve('@composio/core');
const normalizedPath = resolvedPath.split(path.sep).join('/');
assert.ok(
  normalizedPath.endsWith('/dist/index.mjs'),
  `Expected @composio/core to resolve to dist/index.mjs, got ${resolvedPath}`
);
assert.ok(!normalizedPath.endsWith('.cjs'), `Expected no CJS artifact, got ${resolvedPath}`);
console.log('Test 2 passed: resolved ESM entrypoint\n');

console.log('Test 3: require("@composio/core") should not throw...');
let composioModule;
try {
  composioModule = require('@composio/core');
  console.log('Test 3 passed: require() succeeded\n');
} catch (error) {
  console.error('Test 3 failed: require() threw an error');
  console.error(error);
  process.exit(1);
}

console.log('Test 4: Composio class should be exported...');
assert.ok(composioModule.Composio, 'Composio class should be exported');
assert.strictEqual(typeof composioModule.Composio, 'function', 'Composio should be a constructor');
console.log('Test 4 passed: Composio class is exported\n');

console.log('Test 5: OpenAIProvider class should be exported...');
assert.ok(composioModule.OpenAIProvider, 'OpenAIProvider class should be exported');
assert.strictEqual(
  typeof composioModule.OpenAIProvider,
  'function',
  'OpenAIProvider should be a constructor'
);
console.log('Test 5 passed: OpenAIProvider class is exported\n');

console.log('Test 6: OpenAIProvider should be instantiable...');
try {
  const provider = new composioModule.OpenAIProvider();
  assert.ok(provider, 'Provider instance should exist');
  console.log('Test 6 passed: OpenAIProvider instantiated successfully\n');
} catch (error) {
  console.error('Test 6 failed: Could not instantiate OpenAIProvider');
  console.error(error);
  process.exit(1);
}

console.log('Test 7: AuthScheme should be exported...');
assert.ok(composioModule.AuthScheme, 'AuthScheme should be exported');
console.log('Test 7 passed: AuthScheme is exported\n');

console.log('Test 8: Error classes should be exported...');
assert.ok(composioModule.ComposioError, 'ComposioError should be exported');
console.log('Test 8 passed: Error classes are exported\n');

console.log('Test 9: jsonSchemaToZodSchema should be exported...');
assert.ok(composioModule.jsonSchemaToZodSchema, 'jsonSchemaToZodSchema should be exported');
assert.strictEqual(
  typeof composioModule.jsonSchemaToZodSchema,
  'function',
  'jsonSchemaToZodSchema should be a function'
);
console.log('Test 9 passed: jsonSchemaToZodSchema is exported\n');

console.log('Test 10: constants namespace should be exported...');
assert.ok(composioModule.constants, 'constants should be exported');
console.log('Test 10 passed: constants namespace is exported\n');

console.log('Test 11: logger should be exported...');
assert.ok(composioModule.logger, 'logger should be exported');
console.log('Test 11 passed: logger is exported\n');

console.log('========================================');
console.log('All CommonJS require(esm) interop tests passed!');
console.log('========================================');
process.exit(0);
