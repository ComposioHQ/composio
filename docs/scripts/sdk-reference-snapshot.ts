import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { assertFrozenPages, assertFrozenSnapshot, prepareStableReference } from '../lib/sdk-reference-content';
import {
  assertForwardSnapshot,
  languages,
  parseSnapshot,
  reviseSnapshot,
  snapshotDirectory,
  stableReferenceRoot,
} from '../lib/sdk-reference-snapshot';

const docsRoot = fileURLToPath(new URL('..', import.meta.url));
const repo = join(docsRoot, '..');
const commitSha = z.string().regex(/^[a-f0-9]{40}$/);
const usage = () => new Error(
  'Usage: bun scripts/sdk-reference-snapshot.ts prepare | revise <typescript|python> | check [<commit>]'
);

const installWithRetry = async (command: string, args: string[]) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      execFileSync(command, args, { cwd: repo, stdio: 'inherit', timeout: 120_000 });
      return;
    } catch (error) {
      console.error(`${command} install failed (attempt ${attempt}/5): ${String(error)}`);
      if (attempt === 5) throw error;
      await setTimeout(30_000);
    }
  }
};

async function checkSnapshots(base?: string): Promise<void> {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (base !== undefined) git('cat-file', '-e', `${base}^{commit}`);

  const snapshots = languages.map(language => {
    const directory = snapshotDirectory(docsRoot, language);
    const snapshot = assertFrozenSnapshot(directory, language);
    const path = relative(repo, join(directory, 'manifest.json'));
    if (base !== undefined && git('ls-tree', base, '--', path).trim()) {
      assertForwardSnapshot(parseSnapshot(git('show', `${base}:${path}`)), snapshot);
    }
    return { language, snapshot, pages: join(directory, 'pages') };
  });

  const run = (command: string, args: string[], cwd = repo) => {
    execFileSync(command, args, { cwd, stdio: 'inherit' });
  };

  const scratch = mkdtempSync(join(tmpdir(), 'composio-reference-install-'));
  try {
    for (const { language, snapshot: { version }, pages } of snapshots) {
      console.log(`Checking the ${language} SDK reference against ${version}`);
      if (language === 'typescript') {
        await installWithRetry('npm', [
          'install', '--prefix', scratch, '--no-audit', '--no-fund', '--ignore-scripts',
          '--registry=https://registry.npmjs.org', `@composio/core@${version}`,
        ]);
        run('bun', [
          'scripts/docs-reference-check/main.ts', '--package',
          join(scratch, 'node_modules/@composio/core'), pages,
        ]);
      } else {
        const venv = join(scratch, 'venv');
        run('uv', ['venv', '--no-project', '--python', '3.12', venv]);
        const python = join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
        if (!existsSync(python)) throw new Error(`Could not find Python at ${python}`);
        await installWithRetry('uv', [
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
}

const { positionals } = parseArgs({ allowPositionals: true, options: {} });
const [command, value, ...extra] = positionals;
if (extra.length > 0) throw usage();

switch (command) {
  case 'prepare': {
    if (value !== undefined) throw usage();
    const destination = stableReferenceRoot(docsRoot);
    prepareStableReference(docsRoot, destination);
    console.log(destination);
    break;
  }
  case 'revise': {
    const language = languages.find(language => language === value);
    if (language === undefined) throw usage();
    const directory = snapshotDirectory(docsRoot, language);
    // A hand correction still has to stay frozen: no unpinned install command,
    // no `next` source link, banner still naming the snapshot's version. The
    // digest is deliberately not compared here — recording it is this command's job.
    assertFrozenPages(directory, language);
    if (reviseSnapshot(directory)) console.log(`Revised the ${language} SDK reference`);
    break;
  }
  case 'check':
    if (value !== undefined && !commitSha.safeParse(value).success) throw usage();
    await checkSnapshots(value);
    break;
  default:
    throw usage();
}
