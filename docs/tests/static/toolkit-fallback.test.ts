import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
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

const getToolkitBySlug = mock(async (_slug: string): Promise<Toolkit | null> => null);
const fetchToolkitFromProduction = mock(
  async (_slug: string): Promise<Toolkit | null> => null
);

mock.module('@/lib/toolkit-data', () => ({ getToolkitBySlug }));
mock.module('@/lib/toolkit-api', () => ({ fetchToolkitFromProduction }));

let resolveToolkit: typeof import('../../lib/toolkit-resolution').resolveToolkit;

beforeAll(async () => {
  ({ resolveToolkit } = await import('../../lib/toolkit-resolution'));
});

beforeEach(() => {
  getToolkitBySlug.mockReset();
  fetchToolkitFromProduction.mockReset();
});

describe('resolveToolkit', () => {
  test('returns a snapshot hit without calling production', async () => {
    getToolkitBySlug.mockResolvedValue(snapshotToolkit);

    expect(await resolveToolkit('github')).toEqual(snapshotToolkit);
    expect(getToolkitBySlug).toHaveBeenCalledWith('github');
    expect(fetchToolkitFromProduction).not.toHaveBeenCalled();
  });

  test('returns a production toolkit after a snapshot miss', async () => {
    getToolkitBySlug.mockResolvedValue(null);
    fetchToolkitFromProduction.mockResolvedValue(liveToolkit);

    expect(await resolveToolkit('live-only')).toEqual(liveToolkit);
    expect(fetchToolkitFromProduction).toHaveBeenCalledWith('live-only');
  });

  test('returns null when both snapshot and production miss', async () => {
    getToolkitBySlug.mockResolvedValue(null);
    fetchToolkitFromProduction.mockResolvedValue(null);

    expect(await resolveToolkit('__definitely-not-a-toolkit__')).toBeNull();
  });
});
