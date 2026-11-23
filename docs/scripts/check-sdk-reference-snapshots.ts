import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertForwardSnapshot,
  languages,
  parseSnapshot,
  snapshotDirectory,
  verifySnapshot,
} from '../lib/sdk-reference-snapshot';

const docsRoot = fileURLToPath(new URL('..', import.meta.url));
const repo = join(docsRoot, '..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const base = process.argv[2];
if (process.argv.length > 3 || (base !== undefined && !/^[a-f0-9]{40}$/.test(base))) {
  throw new Error('Usage: bun docs/scripts/check-sdk-reference-snapshots.ts [base-commit-sha]');
}
if (base !== undefined) git('cat-file', '-e', `${base}^{commit}`);

const snapshots = languages.map(language => {
  const directory = snapshotDirectory(docsRoot, language);
  const snapshot = verifySnapshot(directory);
  const path = relative(repo, join(directory, 'manifest.json'));
  if (base !== undefined && git('ls-tree', base, '--', path).trim()) {
    assertForwardSnapshot(parseSnapshot(git('show', `${base}:${path}`)), snapshot);
  }
  return { language, snapshot, pages: join(directory, 'pages') };
});

function run(command: string, args: string[], cwd = repo): void {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

const scratch = mkdtempSync(join(tmpdir(), 'composio-reference-install-'));
try {
  for (const { language, snapshot: { version }, pages } of snapshots) {
    console.log(`Checking the ${language} SDK reference against ${version}`);
    if (language === 'typescript') {
      run('npm', [
        'install', '--prefix', scratch, '--no-audit', '--no-fund', '--ignore-scripts',
        '--registry=https://registry.npmjs.org', `@composio/core@${version}`,
      ]);
      run('bun', [
        'scripts/docs-reference-check/main.ts', '--installed-package',
        join(scratch, 'node_modules/@composio/core'), pages,
      ]);
    } else {
      const venv = join(scratch, 'venv');
      run('uv', ['venv', '--no-project', '--python', '3.12', venv]);
      const python = join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      if (!existsSync(python)) throw new Error(`Could not find Python at ${python}`);
      run('uv', [
        'pip', 'install', '--python', python, '--only-binary', 'composio',
        '--default-index', 'https://pypi.org/simple', `composio==${version}`,
      ]);
      run('bun', [
        'scripts/check-python-snippets.ts', '--reference', '--installed-python', python,
        '--directory', pages,
      ], docsRoot);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
