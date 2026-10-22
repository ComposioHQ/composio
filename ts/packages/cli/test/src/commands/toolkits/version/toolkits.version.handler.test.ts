import { describe, expect, it } from 'vitest';
import {
  formatToolkitVersions,
  formatToolkitVersionsJson,
} from 'src/commands/toolkits/version/toolkits.version.format';
import { toolkitVersionsOf } from 'src/commands/toolkits/version/toolkits.version.handler';

const history = (count: number) =>
  Array.from({ length: count }, (_, index) => `20260101_${String(index + 1).padStart(2, '0')}`);

describe('toolkits version handler: toolkitVersionsOf', () => {
  // The latest version is the last listed one; at most the last 20 are kept.
  it.each([
    {
      name: '25 versions',
      meta: { available_versions: history(25) },
      latestVersion: '20260101_25',
      recentVersions: history(25).slice(-20),
    },
    {
      name: 'two versions',
      meta: { available_versions: ['20260101_00', '20260201_00'] },
      latestVersion: '20260201_00',
      recentVersions: ['20260101_00', '20260201_00'],
    },
    {
      name: 'an empty version list',
      meta: { available_versions: [] },
      latestVersion: null,
      recentVersions: [],
    },
    { name: 'no version list', meta: {}, latestVersion: null, recentVersions: [] },
    { name: 'no meta', meta: undefined, latestVersion: null, recentVersions: [] },
  ])('[Given] $name [Then] latest is $latestVersion', ({ meta, latestVersion, recentVersions }) => {
    expect(toolkitVersionsOf({ slug: 'gmail', name: 'Gmail', meta })).toEqual({
      slug: 'gmail',
      name: 'Gmail',
      latestVersion,
      recentVersions,
    });
  });
});

describe('toolkits version format', () => {
  it('[Given] no versions [Then] both renderers say so', () => {
    const versions = toolkitVersionsOf({ slug: 'gmail', name: 'Gmail' });

    expect(formatToolkitVersions(versions)).toBe(
      'Toolkit: Gmail (gmail)\nLatest Version: none\nLast 0 Available Versions:\n- none'
    );
    expect(JSON.parse(formatToolkitVersionsJson(versions))).toEqual({
      slug: 'gmail',
      latest_version: null,
      available_versions_last_20: [],
    });
  });
});
