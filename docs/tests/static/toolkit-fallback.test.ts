import { describe, expect, mock, test } from 'bun:test';
import { createToolkitResolver } from '../../lib/toolkit-resolution';
import type { Toolkit } from '../../types/toolkit';

const snapshotToolkit: Toolkit = {
  slug: 'github',
  name: 'GitHub',
  logo: 'https://logos.composio.dev/api/github',
  description: 'GitHub snapshot description',
  category: 'developer tools',
  authSchemes: ['OAUTH2'],
  composioManagedAuthSchemes: ['OAUTH2'],
  toolCount: 10,
  triggerCount: 2,
  version: '20260817_00',
  tools: [],
  triggers: [],
};

const liveToolkit: Toolkit = {
  ...snapshotToolkit,
  slug: 'live-only',
  name: 'Live Only',
  description: 'Production fallback description',
  version: null,
};

function createTestResolver() {
  const getToolkitBySlug = mock(async (_slug: string): Promise<Toolkit | null> => null);
  const fetchToolkitFromProduction = mock(
    async (_slug: string): Promise<Toolkit | null> => null
  );
  const resolveToolkit = createToolkitResolver({
    getToolkitBySlug,
    fetchToolkitFromProduction,
  });

  return { resolveToolkit, getToolkitBySlug, fetchToolkitFromProduction };
}

describe('resolveToolkit', () => {
  test('returns a snapshot hit without calling production', async () => {
    const { resolveToolkit, getToolkitBySlug, fetchToolkitFromProduction } = createTestResolver();
    getToolkitBySlug.mockResolvedValue(snapshotToolkit);

    expect(await resolveToolkit('github')).toEqual(snapshotToolkit);
    expect(getToolkitBySlug).toHaveBeenCalledWith('github');
    expect(fetchToolkitFromProduction).not.toHaveBeenCalled();
  });

  test('normalizes the slug before reading the snapshot', async () => {
    const { resolveToolkit, getToolkitBySlug, fetchToolkitFromProduction } = createTestResolver();
    getToolkitBySlug.mockResolvedValue(snapshotToolkit);

    expect(await resolveToolkit('GitHub')).toEqual(snapshotToolkit);
    expect(getToolkitBySlug).toHaveBeenCalledWith('github');
    expect(fetchToolkitFromProduction).not.toHaveBeenCalled();
  });

  test('returns a production toolkit after a snapshot miss', async () => {
    const { resolveToolkit, getToolkitBySlug, fetchToolkitFromProduction } = createTestResolver();
    getToolkitBySlug.mockResolvedValue(null);
    fetchToolkitFromProduction.mockResolvedValue(liveToolkit);

    expect(await resolveToolkit('live-only')).toEqual(liveToolkit);
    expect(fetchToolkitFromProduction).toHaveBeenCalledWith('live-only');
  });

  test('returns null when both snapshot and production miss', async () => {
    const { resolveToolkit, getToolkitBySlug, fetchToolkitFromProduction } = createTestResolver();
    getToolkitBySlug.mockResolvedValue(null);
    fetchToolkitFromProduction.mockResolvedValue(null);

    expect(await resolveToolkit('__definitely-not-a-toolkit__')).toBeNull();
  });

  test('rejects test_app without reading the snapshot or production', async () => {
    const { resolveToolkit, getToolkitBySlug, fetchToolkitFromProduction } = createTestResolver();
    expect(await resolveToolkit('TEST_APP')).toBeNull();
    expect(getToolkitBySlug).not.toHaveBeenCalled();
    expect(fetchToolkitFromProduction).not.toHaveBeenCalled();
  });
});
