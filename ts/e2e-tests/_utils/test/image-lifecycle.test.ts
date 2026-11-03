import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureCliImage } from '../src/image-lifecycle';
import { getRepoRoot } from '../src/config';

let directory: string;
let previousPath: string | undefined;
let previousActions: string | undefined;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'cli-image-reuse-'));
  previousPath = process.env.PATH;
  previousActions = process.env.GITHUB_ACTIONS;
  process.env.PATH = `${directory}:${previousPath}`;
  delete process.env.GITHUB_ACTIONS;
  process.env.CLI_IMAGE_TEST_DIR = directory;
  const docker = join(directory, 'docker');
  writeFileSync(
    docker,
    `#!/bin/sh
if [ "$1" = image ]; then
  cat "$CLI_IMAGE_TEST_DIR/revision"
  exit 0
fi
printf '%s\\n' "$*" >> "$CLI_IMAGE_TEST_DIR/builds"
if [ -f "$CLI_IMAGE_TEST_DIR/fail" ]; then
  echo 'already exists' >&2
  exit 1
fi
cat "$CLI_IMAGE_TEST_DIR/source" > "$CLI_IMAGE_TEST_DIR/built-source"
`
  );
  chmodSync(docker, 0o755);
  writeFileSync(join(directory, 'revision'), 'old-revision');
  writeFileSync(join(directory, 'source'), 'first-source');
});

afterEach(() => {
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  if (previousActions === undefined) delete process.env.GITHUB_ACTIONS;
  else process.env.GITHUB_ACTIONS = previousActions;
  delete process.env.CLI_IMAGE_TEST_DIR;
  rmSync(directory, { recursive: true, force: true });
});

const currentRevision = () =>
  Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
    cwd: getRepoRoot(),
    stdout: 'pipe',
    stderr: 'pipe',
  })
    .stdout.toString()
    .trim();

const options = () => ({ repoRoot: getRepoRoot() });

describe('CLI image reuse', () => {
  test('refreshes local source even when the version and revision are unchanged', async () => {
    writeFileSync(join(directory, 'revision'), currentRevision());
    await ensureCliImage('0.0.0-development', options());
    writeFileSync(join(directory, 'source'), 'dirty-source');
    await ensureCliImage('0.0.0-development', options());
    expect(readFileSync(join(directory, 'built-source'), 'utf8')).toBe('dirty-source');
    expect(readFileSync(join(directory, 'builds'), 'utf8').trim().split('\n')).toHaveLength(2);
  });

  test('rebuilds a CI image carrying a different source revision', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    await ensureCliImage('0.0.0-development', options());
    expect(readFileSync(join(directory, 'builds'), 'utf8')).toContain(
      `org.opencontainers.image.revision=${currentRevision()}`
    );
  });

  test('reuses the CI prebuild only for the checkout revision', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    writeFileSync(join(directory, 'revision'), currentRevision());
    await ensureCliImage('0.0.0-development', options());
    expect(Bun.file(join(directory, 'builds')).size).toBe(0);
  });

  test('does not accept a stale tag after a failed rebuild', async () => {
    writeFileSync(join(directory, 'fail'), '');
    await expect(ensureCliImage('0.0.0-development', options())).rejects.toThrow(
      'Failed to build Docker image'
    );
  });
});
