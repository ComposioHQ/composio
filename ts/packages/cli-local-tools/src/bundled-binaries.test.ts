import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod/v3';
import { detectCliPlatform } from './platform';
import { checkLocalToolkitsReadiness } from './readiness';
import { normalizeLocalToolSlug } from './registry';
import { executeLocalTool } from './runtime';
import type { LocalToolkitDeclaration } from './types';

const tempDirs: string[] = [];
const originalBinDir = process.env.COMPOSIO_LOCAL_TOOLS_BIN_DIR;

afterEach(async () => {
  if (originalBinDir === undefined) {
    delete process.env.COMPOSIO_LOCAL_TOOLS_BIN_DIR;
  } else {
    process.env.COMPOSIO_LOCAL_TOOLS_BIN_DIR = originalBinDir;
  }
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { force: true, recursive: true })));
});

const createExecutable = async (relativePath: string, source: string): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'composio-local-tools-bin-'));
  tempDirs.push(root);
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, source, 'utf8');
  await fs.chmod(absolutePath, 0o755);
  process.env.COMPOSIO_LOCAL_TOOLS_BIN_DIR = root;
  return absolutePath;
};

describe('@composio/cli-local-tools bundled binaries', () => {
  it('resolves and executes platform-specific bundled command binaries', async () => {
    const platform = detectCliPlatform();
    const relativePath = path.join(platform, 'fixture-tool');
    const executablePath = await createExecutable(
      relativePath,
      '#!/usr/bin/env bash\nprintf \'{"ok":true,"value":"%s"}\' "$1"\n'
    );

    const toolkit: LocalToolkitDeclaration = {
      slug: 'FIXTURE_APP',
      name: 'Fixture App',
      description: 'Fixture local toolkit for bundled binary tests.',
      platforms: [platform],
      bundledBinaries: [
        {
          id: 'fixture-tool',
          targets: [{ platforms: [platform], path: relativePath }],
        },
      ],
      tools: [
        {
          slug: 'RUN_BUNDLED',
          name: 'Run bundled command',
          description: 'Runs the bundled fixture executable.',
          platforms: [platform],
          inputParams: z.object({ value: z.string() }),
          execution: {
            kind: 'command',
            command: { bundledBinary: 'fixture-tool' },
            args: input => [String(input.value)],
            parseJson: true,
          },
        },
      ],
    };
    const tool = toolkit.tools[0]!;
    const finalSlug = normalizeLocalToolSlug(tool.slug, toolkit.slug);

    const readiness = await checkLocalToolkitsReadiness({
      currentPlatform: platform,
      declarations: [toolkit],
      metaOptions: {
        path: path.join(os.tmpdir(), `composio-local-tools-test-${Date.now()}.json`),
      },
    });
    expect(readiness.toolkits[0]?.tools[0]?.command?.path).toBe(executablePath);

    const result = await executeLocalTool(
      tool.execution,
      { value: 'hello' },
      { toolkit, tool, finalSlug, platform }
    );

    expect(result.command).toBe(executablePath);
    expect(result.parsed).toEqual({ ok: true, value: 'hello' });
  });
});
