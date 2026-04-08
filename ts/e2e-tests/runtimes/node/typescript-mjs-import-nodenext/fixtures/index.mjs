/**
 * E2E test: TypeScript .mjs import resolution with moduleResolution: "nodenext"
 *
 * This suite keeps a committed sample of Composio-generated TypeScript sources
 * and verifies that representative `.js` import specifiers compile successfully
 * with moduleResolution: "nodenext".
 */

import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = join(__dirname, 'fixture-generated');
const TSCONFIG_PATH = join(__dirname, 'tsconfig.json');
const TSC_TIMEOUT_MS = 60_000;

console.log('🧪 Testing TypeScript .mjs import resolution with moduleResolution: "nodenext"...\n');
console.log(`Node.js version: ${process.version}`);
console.log(`Working directory: ${__dirname}\n`);

// Test 1: Verify representative generated files exist
console.log('Test 1: Verifying fixture generated files exist...');
try {
  assert.ok(existsSync(GENERATED_DIR), 'Generated directory should exist');

  const files = readdirSync(GENERATED_DIR);
  console.log('Generated files:', files);

  assert.ok(files.length > 0, 'Generated directory should not be empty');
  assert.ok(files.includes('index.ts'), 'Generated directory should include index.ts');
  assert.ok(files.includes('codeinterpreter.ts'), 'Generated directory should include codeinterpreter.ts');
  console.log('✅ Test 1 passed: Fixture generated files exist\n');
} catch (error) {
  console.error('❌ Test 1 failed: Fixture generated files verification failed');
  console.error(error.message);
  process.exit(1);
}

// Test 2: Run tsc --noEmit to check TypeScript compilation
console.log('Test 2: Running tsc --noEmit to verify TypeScript compilation...');
console.log('Expected: SUCCESS when generated source uses ".js" specifiers under nodenext\n');

try {
  execSync(`npx tsc --noEmit -p ${TSCONFIG_PATH}`, {
    cwd: __dirname,
    stdio: 'pipe',
    encoding: 'utf-8',
    timeout: TSC_TIMEOUT_MS,
  });

  console.log('✅ Test 2 passed: TypeScript compilation succeeded');
  console.log('   (fixture imports correctly use ".js" specifiers)\n');
} catch (error) {
  const stdout = error.stdout?.toString?.() || error.stdout || '';
  const stderr = error.stderr?.toString?.() || error.stderr || '';
  const output = stdout + stderr + error.message;

  if (output.includes('TS2307') && output.includes('.mjs')) {
    console.error('❌ Test 2 failed: TypeScript compilation failed with TS2307');
    console.error('   This likely means the generated imports still use ".mjs" under nodenext.');
  } else {
    console.error('❌ Test 2 failed: TypeScript compilation failed');
  }
  console.error('output:', output);
  console.error('stdout:', stdout);
  console.error('stderr:', stderr);
  console.error('message:', error.message);
  process.exit(1);
}

console.log('========================================');
console.log('🎉 All tests passed!');
console.log('========================================');
process.exit(0);
