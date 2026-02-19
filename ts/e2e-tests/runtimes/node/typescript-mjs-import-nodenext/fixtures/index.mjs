/**
 * E2E test: TypeScript .mjs import resolution with moduleResolution: "nodenext"
 *
 * This test verifies that generated TypeScript files with .mjs imports
 * can be compiled successfully with moduleResolution: "nodenext".
 *
 * The issue: When `composio ts generate` uses importExtension: 'mjs',
 * the generated .ts files contain `import ... from "./foo.mjs"` statements.
 * With moduleResolution: "node16" or "nodenext", TypeScript expects .mjs
 * imports to resolve to .mts files, NOT .ts files.
 *
 * This causes TS2307: Cannot find module './foo.mjs' errors.
 */

import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = join(__dirname, 'generated');

console.log('🧪 Testing TypeScript .mjs import resolution with moduleResolution: "nodenext"...\n');
console.log(`Node.js version: ${process.version}`);
console.log(`Working directory: ${__dirname}\n`);

// Cleanup generated directory if it exists
if (existsSync(GENERATED_DIR)) {
  console.log('Cleaning up previous generated files...');
  rmSync(GENERATED_DIR, { recursive: true });
}

// Test 1: Run composio ts generate --toolkits entelligence --output-dir ./generated
console.log('Test 1: Running composio ts generate --toolkits entelligence --output-dir ./generated...');
try {
  // Use the composio CLI binary built and installed to /usr/local/bin in the Dockerfile
  execSync(`composio ts generate --toolkits entelligence --output-dir ${GENERATED_DIR}`, {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  console.log('✅ Test 1 passed: composio ts generate succeeded\n');
} catch (error) {
  console.error('❌ Test 1 failed: composio ts generate threw an error');
  console.error(error.message);
  process.exit(1);
}

// Test 2: Verify generated files exist
console.log('Test 2: Verifying generated files exist...');
try {
  assert.ok(existsSync(GENERATED_DIR), 'Generated directory should exist');

  const files = readdirSync(GENERATED_DIR);
  console.log('Generated files:', files);

  assert.ok(files.length > 0, 'Generated directory should not be empty');
  assert.ok(files.some((f) => f.endsWith('.ts')), 'Should have .ts files');

  console.log('✅ Test 2 passed: Generated files exist\n');
} catch (error) {
  console.error('❌ Test 2 failed: Generated files verification failed');
  console.error(error.message);
  process.exit(1);
}

// Test 3: Run tsc --noEmit to check TypeScript compilation
console.log('Test 3: Running tsc --noEmit to verify TypeScript compilation...');
console.log('Expected: FAILURE with TS2307 if importExtension is "mjs"');
console.log('Expected: SUCCESS if importExtension is "js"\n');

try {
  execSync('npx tsc --noEmit', {
    cwd: __dirname,
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  console.log('✅ Test 3 passed: TypeScript compilation succeeded');
  console.log('   (importExtension is correctly set to "js")\n');
} catch (error) {
  // execSync error object has stdout/stderr as Buffer or string
  const stdout = error.stdout?.toString?.() || error.stdout || '';
  const stderr = error.stderr?.toString?.() || error.stderr || '';
  const output = stdout + stderr + error.message;

  if (output.includes('TS2307') && output.includes('.mjs')) {
    console.log('❌ Test 3 failed: TypeScript compilation failed with TS2307');
    console.log('   This confirms the bug: .mjs imports do not resolve to .ts files');
    console.log('   with moduleResolution: "nodenext"\n');
    console.log('Error output:');
    console.log(stdout || stderr);
    process.exit(1);
  }

  console.error('❌ Test 3 failed: Unexpected TypeScript error');
  console.error('stdout:', stdout);
  console.error('stderr:', stderr);
  console.error('message:', error.message);
  process.exit(1);
}

console.log('========================================');
console.log('🎉 All tests passed!');
console.log('========================================');
process.exit(0);
