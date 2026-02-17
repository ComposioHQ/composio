/**
 * ESM compatibility test for @composio/core in Deno
 * Uses npm: specifier to import the package
 */

import { assert } from 'jsr:@std/assert@^1.0.0';

console.log('Testing ESM compatibility for @composio/core in Deno...\n');

// Test 1: Dynamic import works via npm: specifier
console.log('Test 1: import("npm:@composio/core") should not throw...');
let composioModule: Record<string, unknown>;
try {
  composioModule = await import('npm:@composio/core');
  console.log('Test 1 passed: import() succeeded\n');
} catch (error) {
  console.error('Test 1 failed: import() threw an error');
  console.error(error);
  Deno.exit(1);
}

// Test 2: Composio class is exported
console.log('Test 2: Composio class should be exported...');
assert(composioModule.Composio, 'Composio class should be exported');
assert(typeof composioModule.Composio === 'function', 'Composio should be a constructor');
console.log('Test 2 passed: Composio class is exported\n');

// Test 3: OpenAIProvider class is exported
console.log('Test 3: OpenAIProvider class should be exported...');
assert(composioModule.OpenAIProvider, 'OpenAIProvider class should be exported');
assert(typeof composioModule.OpenAIProvider === 'function', 'OpenAIProvider should be a constructor');
console.log('Test 3 passed: OpenAIProvider class is exported\n');

// Test 4: Can instantiate OpenAIProvider
console.log('Test 4: OpenAIProvider should be instantiable...');
try {
  const OpenAIProvider = composioModule.OpenAIProvider as new () => unknown;
  const provider = new OpenAIProvider();
  assert(provider, 'Provider instance should exist');
  console.log('Test 4 passed: OpenAIProvider instantiated successfully\n');
} catch (error) {
  console.error('Test 4 failed: Could not instantiate OpenAIProvider');
  console.error(error);
  Deno.exit(1);
}

// Test 5: AuthScheme is exported
console.log('Test 5: AuthScheme should be exported...');
assert(composioModule.AuthScheme, 'AuthScheme should be exported');
console.log('Test 5 passed: AuthScheme is exported\n');

// Test 6: Error classes are exported
console.log('Test 6: Error classes should be exported...');
assert(composioModule.ComposioError, 'ComposioError should be exported');
console.log('Test 6 passed: Error classes are exported\n');

// Test 7: jsonSchemaToZodSchema utility is exported
console.log('Test 7: jsonSchemaToZodSchema should be exported...');
assert(composioModule.jsonSchemaToZodSchema, 'jsonSchemaToZodSchema should be exported');
assert(typeof composioModule.jsonSchemaToZodSchema === 'function', 'jsonSchemaToZodSchema should be a function');
console.log('Test 7 passed: jsonSchemaToZodSchema is exported\n');

// Test 8: constants namespace is exported
console.log('Test 8: constants namespace should be exported...');
assert(composioModule.constants, 'constants should be exported');
console.log('Test 8 passed: constants namespace is exported\n');

// Test 9: logger is exported
console.log('Test 9: logger should be exported...');
assert(composioModule.logger, 'logger should be exported');
console.log('Test 9 passed: logger is exported\n');

console.log('========================================');
console.log('All ESM compatibility tests passed!');
console.log('========================================');
Deno.exit(0);
