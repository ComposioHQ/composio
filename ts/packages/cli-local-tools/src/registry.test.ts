import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v3';
import {
  createLocalToolRouterExperimentalPayload,
  getLocalCustomToolkits,
  getLocalToolkitDeclarations,
  getLocalToolInputDefinition,
  localToolkitDeclarations,
  normalizeLocalToolSlug,
} from './registry';
import { checkLocalToolkitsReadiness } from './readiness';
import type { LocalToolkitDeclaration } from './types';

const fixtureToolkit: LocalToolkitDeclaration = {
  slug: 'FIXTURE_APP',
  name: 'Fixture App',
  description: 'Fixture local toolkit for registry tests.',
  platforms: ['darwin-arm64', 'linux-x64'],
  tools: [
    {
      slug: 'RUN_COMMAND',
      name: 'Run fixture command',
      description: 'Runs a fixture command.',
      platforms: ['darwin-arm64', 'linux-x64'],
      inputParams: z.object({
        args: z.array(z.string()).default([]),
      }),
      execution: {
        kind: 'command',
        command: 'node',
        args: input => (Array.isArray(input.args) ? input.args.map(String) : []),
      },
    },
  ],
};

const findToolkit = (
  payload: ReturnType<typeof createLocalToolRouterExperimentalPayload>,
  slug: string
) => payload?.custom_toolkits?.find(toolkit => toolkit.slug === slug);

describe('@composio/cli-local-tools registry', () => {
  it('registers concrete local toolkits in the integration layer', () => {
    expect(localToolkitDeclarations.map(toolkit => toolkit.slug)).toEqual(
      expect.arrayContaining(['BEEPER_IMESSAGE', 'CHROME_DEVTOOLS', 'PEEKABOO'])
    );
    expect(
      localToolkitDeclarations
        .find(toolkit => toolkit.slug === 'BEEPER_IMESSAGE')
        ?.tools.map(tool => tool.slug)
    ).toEqual(expect.arrayContaining(['LIST_THREADS', 'SEND_MESSAGE', 'AUTHORIZE']));
    expect(
      localToolkitDeclarations
        .find(toolkit => toolkit.slug === 'CHROME_DEVTOOLS')
        ?.tools.map(tool => tool.slug)
    ).toEqual(expect.arrayContaining(['LIST_PAGES', 'NEW_PAGE', 'EVALUATE_SCRIPT']));
    expect(
      localToolkitDeclarations
        .find(toolkit => toolkit.slug === 'PEEKABOO')
        ?.tools.map(tool => tool.slug)
    ).toEqual(expect.arrayContaining(['PERMISSIONS_STATUS', 'SEE', 'CLICK']));
  });

  it('normalizes local tool slugs to the Tool Router LOCAL_<TOOLKIT>_<TOOL> shape', () => {
    expect(normalizeLocalToolSlug('RUN_CLI', 'EXAMPLE_APP')).toBe('LOCAL_EXAMPLE_APP_RUN_CLI');
  });

  it('filters declarations by platform', () => {
    expect(
      getLocalToolkitDeclarations({
        currentPlatform: 'linux-x64',
        declarations: [fixtureToolkit],
      }).map(toolkit => toolkit.slug)
    ).toEqual(['FIXTURE_APP']);
    expect(
      getLocalToolkitDeclarations({
        currentPlatform: 'win32-x64',
        declarations: [fixtureToolkit],
      }).map(toolkit => toolkit.slug)
    ).toEqual([]);
  });

  it('builds core custom toolkit handles for supported local toolkits', () => {
    const [toolkit] = getLocalCustomToolkits({
      currentPlatform: 'linux-x64',
      toolkits: ['fixture_app'],
      declarations: [fixtureToolkit],
    });

    expect(toolkit?.slug).toBe('FIXTURE_APP');
    expect(toolkit?.tools[0]?.slug).toBe('RUN_COMMAND');
    expect(toolkit?.tools[0]?.inputSchema.properties).toHaveProperty('args');
    expect(typeof toolkit?.tools[0]?.execute).toBe('function');
  });

  it('builds Tool Router custom toolkit payloads for supported local toolkits', () => {
    const payload = createLocalToolRouterExperimentalPayload({
      currentPlatform: 'darwin-arm64',
      toolkits: ['fixture_app'],
      declarations: [fixtureToolkit],
    });

    expect(payload?.custom_toolkits).toHaveLength(1);
    expect(findToolkit(payload, 'FIXTURE_APP')?.tools.map(tool => tool.slug)).toEqual([
      'RUN_COMMAND',
    ]);
  });

  it('exposes local input schemas for CLI --get-schema and dry-run validation', () => {
    const definition = getLocalToolInputDefinition('LOCAL_FIXTURE_APP_RUN_COMMAND', {
      declarations: [fixtureToolkit],
    });
    expect(definition?.version).toBe('local');
    expect(definition?.schema.properties).toHaveProperty('args');
  });

  it('reports platform readiness for supplied local toolkit declarations', async () => {
    const report = await checkLocalToolkitsReadiness({
      currentPlatform: 'linux-x64',
      includeUnsupported: true,
      declarations: [fixtureToolkit],
      metaOptions: {
        path: path.join(os.tmpdir(), `composio-local-tools-test-${Date.now()}.json`),
      },
    });

    expect(report.toolkits.find(toolkit => toolkit.slug === 'FIXTURE_APP')?.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ finalSlug: 'LOCAL_FIXTURE_APP_RUN_COMMAND' }),
      ])
    );
  });
});
