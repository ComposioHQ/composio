#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, '..');
const versions = JSON.parse(fs.readFileSync(path.join(skillDir, 'versions.json'), 'utf8'));
const effectPackageNames = [
  'effect',
  '@effect/platform-bun',
  '@effect/platform-node-shared',
  '@effect/vitest',
];
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

for (const [packageName, version] of Object.entries(versions)) {
  if (typeof version !== 'string' || !exactVersion.test(version)) {
    throw new Error(`${packageName} must use an exact semantic version, received ${version}`);
  }
}

const effectBeta = versions.effect;
if (
  !/^4\.0\.0-beta\.\d+$/.test(effectBeta) ||
  effectPackageNames.some(packageName => versions[packageName] !== effectBeta)
) {
  throw new Error(`Effect packages must share one exact v4 beta, received ${effectBeta}`);
}

const dependencySpecs = [
  `effect@${versions.effect}`,
  `@effect/platform-bun@${versions['@effect/platform-bun']}`,
  `@effect/platform-node-shared@${versions['@effect/platform-node-shared']}`,
  `@effect/vitest@${versions['@effect/vitest']}`,
  `@types/node@${versions['@types/node']}`,
  `typescript@${versions.typescript}`,
  `vitest@${versions.vitest}`,
];
const packageJson = JSON.stringify(
  {
    name: 'composio-effect-v4-skill-check',
    private: true,
    type: 'module',
  },
  null,
  2
);
const pnpmWorkspace = 'allowBuilds:\n  msgpackr-extract: false\n';
const tsconfigBase = JSON.stringify(
  {
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      types: ['node'],
      skipLibCheck: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      allowImportingTsExtensions: true,
    },
  },
  null,
  2
);
const bootstrapSpec = JSON.stringify({
  dependencySpecs,
  packageJson,
  pnpmWorkspace,
  tsconfigBase,
});
const cacheDigest = await globalThis.crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(bootstrapSpec)
);
const cachePart = Array.from(new Uint8Array(cacheDigest), byte =>
  byte.toString(16).padStart(2, '0')
).join('');
const scratch = path.join(os.tmpdir(), `composio-effect-v4-skill-${cachePart}`);

const bootstrap = () => {
  const marker = path.join(scratch, '.ready');
  if (fs.existsSync(marker)) return;

  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(scratch, { recursive: true });
  fs.writeFileSync(path.join(scratch, 'package.json'), packageJson);
  fs.writeFileSync(path.join(scratch, 'pnpm-workspace.yaml'), pnpmWorkspace);
  execFileSync('pnpm', ['add', '--save-exact', ...dependencySpecs], {
    cwd: scratch,
    stdio: 'inherit',
  });
  fs.writeFileSync(path.join(scratch, 'tsconfig.base.json'), tsconfigBase);
  fs.writeFileSync(marker, `${bootstrapSpec}\n`);
};

const readBlocks = markdown => {
  const lines = markdown.split('\n');
  const blocks = [];
  let current;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^```(\S*)\s*(.*)$/);
    if (fence && current === undefined) {
      current = { lang: fence[1], info: fence[2] ?? '', startLine: index + 1, code: [] };
    } else if (line.startsWith('```') && current !== undefined) {
      blocks.push({ ...current, code: current.code.join('\n') });
      current = undefined;
    } else if (current !== undefined) {
      current.code.push(line);
    }
  }

  return blocks.filter(
    block =>
      (block.lang === 'ts' || block.lang === 'typescript') && !block.info.includes('no-check')
  );
};

const checkFile = (markdownFile, blocks) => {
  const slug = path.basename(markdownFile).replace(/[^A-Za-z0-9_-]/g, '_');
  const outDir = path.join(scratch, 'blocks', slug);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const sourceMap = new Map();
  blocks.forEach((block, index) => {
    const filename = `block-${String(index + 1).padStart(3, '0')}.ts`;
    sourceMap.set(filename, block);
    fs.writeFileSync(path.join(outDir, filename), block.code);
  });
  fs.writeFileSync(
    path.join(outDir, 'tsconfig.json'),
    JSON.stringify({ extends: '../../tsconfig.base.json', include: ['*.ts'] }, null, 2)
  );

  try {
    execFileSync(
      path.join(scratch, 'node_modules', '.bin', 'tsc'),
      ['-p', path.join(outDir, 'tsconfig.json'), '--pretty', 'false'],
      { cwd: scratch, encoding: 'utf8' }
    );
    console.log(`OK: ${blocks.length} TypeScript block(s) compile in ${markdownFile}`);
    return true;
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    console.error(`FAIL: ${markdownFile}`);
    for (const line of output.split('\n').filter(value => value.includes('error TS'))) {
      const match = line.match(/blocks\/[^/]+\/(block-\d+\.ts)[(:](\d+)/);
      const block = match ? sourceMap.get(match[1]) : undefined;
      const markdownLine = block && match ? block.startLine + Number(match[2]) : '?';
      console.error(`  markdown line ~${markdownLine}: ${line.replace(/^.*error TS/, 'error TS')}`);
    }
    return false;
  }
};

const args = process.argv.slice(2);
const testingReference = path.resolve(
  skillDir,
  '..',
  'typescript-testing',
  'references',
  'effect-v4-cli.md'
);
const minimumBlockCounts = new Map([
  [path.join(skillDir, 'references', 'cli-migration.md'), 1],
  [path.join(skillDir, 'references', 'core-patterns.md'), 1],
  [testingReference, 1],
]);
const defaultMarkdownFiles = [
  path.join(skillDir, 'SKILL.md'),
  ...fs
    .readdirSync(path.join(skillDir, 'references'))
    .filter(filename => filename.endsWith('.md'))
    .sort()
    .map(filename => path.join(skillDir, 'references', filename)),
  testingReference,
];
const defaultTargets = defaultMarkdownFiles.map(markdownFile => ({
  markdownFile,
  minimumBlockCount: minimumBlockCounts.get(markdownFile) ?? 0,
}));
const targets =
  args.length > 0
    ? args.map(value => ({ markdownFile: path.resolve(value), minimumBlockCount: 1 }))
    : defaultTargets;

const preparedTargets = targets.map(({ markdownFile, minimumBlockCount }) => ({
  markdownFile,
  minimumBlockCount,
  blocks: readBlocks(fs.readFileSync(markdownFile, 'utf8')),
}));
const missingBlocks = preparedTargets.filter(
  target => target.blocks.length < target.minimumBlockCount
);
for (const target of missingBlocks) {
  console.error(`FAIL: ${target.markdownFile}`);
  console.error(
    `  expected at least ${target.minimumBlockCount} checked TypeScript block(s), found ${target.blocks.length}`
  );
}
for (const target of preparedTargets.filter(
  value => value.minimumBlockCount === 0 && value.blocks.length === 0
)) {
  console.log(`OK: no checked TypeScript blocks in ${target.markdownFile}`);
}

const checkedTargets = preparedTargets.filter(value => value.blocks.length > 0);
if (checkedTargets.length > 0) bootstrap();
const checkedOk = checkedTargets
  .map(target => checkFile(target.markdownFile, target.blocks))
  .every(Boolean);
const ok = missingBlocks.length === 0 && checkedOk;
process.exit(ok ? 0 : 1);
