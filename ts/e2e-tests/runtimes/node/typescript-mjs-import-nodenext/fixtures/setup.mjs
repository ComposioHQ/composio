/**
 * Setup phase for the nodenext .mjs import resolution e2e test.
 *
 * This runs in the writable Docker volume that the Node e2e runner mounts at
 * fixtures/node_modules, so generated files do not consume container overlay
 * storage in CI.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED_ROOT = join(__dirname, '.e2e-scratch', '.composio-e2e-mjs-import');
const GENERATED_DIR = join(SHARED_ROOT, 'generated');
const TSCONFIG_PATH = join(SHARED_ROOT, 'tsconfig.json');
const GENERATE_TS_TIMEOUT_MS = 90_000;
const GENERATE_TS_MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 2_000;
const TOOLKIT_CANDIDATES = [
  'hackernews',
  'github',
  'gmail',
  'slack',
  'notion',
  'linear',
  'discord',
  'googlecalendar',
  'googledocs',
  'hubspot',
];

console.log('🧪 Preparing TypeScript .mjs import resolution fixtures...\n');
console.log(`Working directory: ${__dirname}`);
console.log(`Shared workspace: ${SHARED_ROOT}\n`);

mkdirSync(SHARED_ROOT, { recursive: true });

writeFileSync(
  TSCONFIG_PATH,
  JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: {
        target: 'es2022',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ['generated'],
    },
    null,
    2
  )
);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const resetGeneratedDir = () => {
  if (existsSync(GENERATED_DIR)) {
    rmSync(GENERATED_DIR, { recursive: true, force: true });
  }
};

const getGeneratedFiles = () => (existsSync(GENERATED_DIR) ? readdirSync(GENERATED_DIR) : []);

for (let attempt = 1; attempt <= GENERATE_TS_MAX_ATTEMPTS; attempt += 1) {
  console.log(`Attempt ${attempt}/${GENERATE_TS_MAX_ATTEMPTS}...`);

  for (const toolkitSlug of TOOLKIT_CANDIDATES) {
    resetGeneratedDir();

    console.log(`Test 1: Running composio generate ts --toolkits ${toolkitSlug}...`);

    try {
      execFileSync('composio', ['generate', 'ts', '--toolkits', toolkitSlug, '--output-dir', GENERATED_DIR], {
        cwd: __dirname,
        stdio: 'pipe',
        encoding: 'utf-8',
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: GENERATE_TS_TIMEOUT_MS,
      });

      const generatedFiles = getGeneratedFiles();
      const generatedTypeScriptFiles = generatedFiles.filter(file => file.endsWith('.ts'));

      if (generatedTypeScriptFiles.length === 0) {
        throw new Error(
          `composio generate ts completed, but ${GENERATED_DIR} did not contain any .ts files`
        );
      }

      console.log('Generated files:', generatedFiles);
      console.log(`Selected toolkit: ${toolkitSlug}`);
      console.log('✅ Test 1 passed: composio generate ts succeeded');
      process.exit(0);
    } catch (error) {
      const stdout = error.stdout?.toString?.() || error.stdout || '';
      const stderr = error.stderr?.toString?.() || error.stderr || '';
      const timedOut = error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT';

      console.error(
        `❌ Test 1 candidate ${toolkitSlug} failed on attempt ${attempt}/${GENERATE_TS_MAX_ATTEMPTS}`
      );
      if (timedOut) {
        console.error(`command timed out after ${GENERATE_TS_TIMEOUT_MS}ms`);
      }
      if (stdout) {
        console.error('stdout:');
        console.error(stdout);
      }
      if (stderr) {
        console.error('stderr:');
        console.error(stderr);
      }
      console.error(error.message);
    }
  }

  if (attempt < GENERATE_TS_MAX_ATTEMPTS) {
    console.error(`Retrying in ${RETRY_DELAY_MS}ms...\n`);
    await sleep(RETRY_DELAY_MS);
    continue;
  }

  console.error(`Unable to generate TypeScript sources for any toolkit: ${TOOLKIT_CANDIDATES.join(', ')}`);
  process.exit(1);
}
