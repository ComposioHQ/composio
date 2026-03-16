/**
 * ESM compatibility test for @composio/core
 * This test verifies that the package can be imported using ESM import syntax in Node.js
 */

import assert from 'node:assert';

console.log('🧪 Testing ESM compatibility for @composio/core...\n');

// Test 1: Dynamic import works
console.log('Test 1: import("@composio/core") should not throw...');
let composioModule;
try {
  composioModule = await import('@composio/core');
  console.log('✅ Test 1 passed: import() succeeded\n');
} catch (error) {
  console.error('❌ Test 1 failed: import() threw an error');
  console.error(error);
  process.exit(1);
}

// Test 2: Composio class is exported
console.log('Test 2: Composio class should be exported...');
assert.ok(composioModule.Composio, 'Composio class should be exported');
assert.strictEqual(typeof composioModule.Composio, 'function', 'Composio should be a constructor');
console.log('✅ Test 2 passed: Composio class is exported\n');

// Test 3: OpenAIProvider class is exported
console.log('Test 3: OpenAIProvider class should be exported...');
assert.ok(composioModule.OpenAIProvider, 'OpenAIProvider class should be exported');
assert.strictEqual(typeof composioModule.OpenAIProvider, 'function', 'OpenAIProvider should be a constructor');
console.log('✅ Test 3 passed: OpenAIProvider class is exported\n');

// Test 4: Can instantiate OpenAIProvider (doesn't require API key)
console.log('Test 4: OpenAIProvider should be instantiable...');
try {
  const provider = new composioModule.OpenAIProvider();
  assert.ok(provider, 'Provider instance should exist');
  console.log('✅ Test 4 passed: OpenAIProvider instantiated successfully\n');
} catch (error) {
  console.error('❌ Test 4 failed: Could not instantiate OpenAIProvider');
  console.error(error);
  process.exit(1);
}

// Test 5: AuthScheme is exported
console.log('Test 5: AuthScheme should be exported...');
assert.ok(composioModule.AuthScheme, 'AuthScheme should be exported');
console.log('✅ Test 5 passed: AuthScheme is exported\n');

// Test 6: Error classes are exported
console.log('Test 6: Error classes should be exported...');
assert.ok(composioModule.ComposioError, 'ComposioError should be exported');
console.log('✅ Test 6 passed: Error classes are exported\n');

// Test 7: jsonSchemaToZodSchema utility is exported
console.log('Test 7: jsonSchemaToZodSchema should be exported...');
assert.ok(composioModule.jsonSchemaToZodSchema, 'jsonSchemaToZodSchema should be exported');
assert.strictEqual(typeof composioModule.jsonSchemaToZodSchema, 'function', 'jsonSchemaToZodSchema should be a function');
console.log('✅ Test 7 passed: jsonSchemaToZodSchema is exported\n');

// Test 8: constants namespace is exported
console.log('Test 8: constants namespace should be exported...');
assert.ok(composioModule.constants, 'constants should be exported');
console.log('✅ Test 8 passed: constants namespace is exported\n');

// Test 9: logger is exported
console.log('Test 9: logger should be exported...');
assert.ok(composioModule.logger, 'logger should be exported');
console.log('✅ Test 9 passed: logger is exported\n');

// Test 10: Static import works (test via re-export)
console.log('Test 10: Static import syntax should work...');
try {
  const { Composio, OpenAIProvider } = await import('@composio/core');
  assert.ok(Composio, 'Named import Composio should work');
  assert.ok(OpenAIProvider, 'Named import OpenAIProvider should work');
  console.log('✅ Test 10 passed: Static import syntax works\n');
} catch (error) {
  console.error('❌ Test 10 failed: Static import syntax threw an error');
  console.error(error);
  process.exit(1);
}

console.log('========================================');
console.log('🎉 All ESM compatibility tests passed!');
console.log('========================================');
process.exit(0);
