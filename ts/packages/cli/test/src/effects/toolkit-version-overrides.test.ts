import { describe, it, expect, vi, afterEach } from '@effect/vitest';
import { Effect } from 'effect';
import {
  getToolkitVersionOverrides,
  buildToolkitVersionSpecs,
  groupByVersion,
  type ToolkitVersionOverrides,
  type ToolkitVersionSpec,
} from 'src/effects/toolkit-version-overrides';

describe('toolkit-version-overrides', () => {
  afterEach(() => {
    // Clean up env vars after each test
    vi.unstubAllEnvs();
  });

  describe('getToolkitVersionOverrides', () => {
    it.effect('should return empty map when no env vars set', () =>
      Effect.gen(function* () {
        const result = yield* getToolkitVersionOverrides;
        expect(result.size).toBe(0);
      })
    );

    it.effect('should parse single env var with COMPOSIO_ prefix', () =>
      Effect.gen(function* () {
        vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', '20250901_00');
        const result = yield* getToolkitVersionOverrides;
        expect(result.get('gmail')).toBe('20250901_00');
        expect(result.size).toBe(1);
      })
    );

    it.effect('should parse multiple env vars', () =>
      Effect.gen(function* () {
        vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', '20250901_00');
        vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_SLACK', '20250815_00');
        const result = yield* getToolkitVersionOverrides;
        expect(result.get('gmail')).toBe('20250901_00');
        expect(result.get('slack')).toBe('20250815_00');
        expect(result.size).toBe(2);
      })
    );

    it.effect('should lowercase toolkit name from env var', () =>
      Effect.gen(function* () {
        vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', '20250901_00');
        const result = yield* getToolkitVersionOverrides;
        expect(result.has('gmail')).toBe(true);
        // Cast to bypass type check - we're testing runtime behavior that uppercase keys are not stored
        expect(result.has('GMAIL' as Lowercase<string>)).toBe(false);
      })
    );

    it.effect('should ignore "latest" as explicit value', () =>
      Effect.gen(function* () {
        vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', 'latest');
        const result = yield* getToolkitVersionOverrides;
        expect(result.size).toBe(0);
      })
    );

    it.effect('should ignore empty string values', () =>
      Effect.gen(function* () {
        vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', '');
        const result = yield* getToolkitVersionOverrides;
        expect(result.size).toBe(0);
      })
    );

    it.effect('should not read env vars without COMPOSIO_ prefix', () =>
      Effect.gen(function* () {
        vi.stubEnv('TOOLKIT_VERSION_GMAIL', '20250901_00');
        const result = yield* getToolkitVersionOverrides;
        expect(result.size).toBe(0);
      })
    );

    it.effect('should handle mixed valid and invalid entries', () =>
      Effect.gen(function* () {
        vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GMAIL', '20250901_00');
        vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_SLACK', 'latest'); // Should be ignored
        vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_GITHUB', ''); // Should be ignored
        vi.stubEnv('COMPOSIO_TOOLKIT_VERSION_NOTION', '20250815_00');
        const result = yield* getToolkitVersionOverrides;
        expect(result.size).toBe(2);
        expect(result.get('gmail')).toBe('20250901_00');
        expect(result.get('notion')).toBe('20250815_00');
      })
    );
  });

  describe('buildToolkitVersionSpecs', () => {
    it('should apply overrides to matching toolkits', () => {
      const overrides: ToolkitVersionOverrides = new Map([['gmail', '20250901_00']]);
      const specs = buildToolkitVersionSpecs(['gmail', 'slack'], overrides);

      expect(specs).toEqual([
        { toolkitSlug: 'gmail', toolkitVersion: '20250901_00' },
        { toolkitSlug: 'slack', toolkitVersion: 'latest' },
      ]);
    });

    it('should handle case-insensitive matching', () => {
      const overrides: ToolkitVersionOverrides = new Map([['gmail', '20250901_00']]);
      const specs = buildToolkitVersionSpecs(['GMAIL', 'Slack'], overrides);

      expect(specs).toEqual([
        { toolkitSlug: 'gmail', toolkitVersion: '20250901_00' },
        { toolkitSlug: 'slack', toolkitVersion: 'latest' },
      ]);
    });

    it('should return all latest when no overrides', () => {
      const overrides: ToolkitVersionOverrides = new Map();
      const specs = buildToolkitVersionSpecs(['gmail', 'slack', 'github'], overrides);

      expect(specs).toEqual([
        { toolkitSlug: 'gmail', toolkitVersion: 'latest' },
        { toolkitSlug: 'slack', toolkitVersion: 'latest' },
        { toolkitSlug: 'github', toolkitVersion: 'latest' },
      ]);
    });

    it('should handle multiple overrides', () => {
      const overrides: ToolkitVersionOverrides = new Map([
        ['gmail', '20250901_00'],
        ['slack', '20250815_00'],
      ]);
      const specs = buildToolkitVersionSpecs(['gmail', 'slack', 'github'], overrides);

      expect(specs).toEqual([
        { toolkitSlug: 'gmail', toolkitVersion: '20250901_00' },
        { toolkitSlug: 'slack', toolkitVersion: '20250815_00' },
        { toolkitSlug: 'github', toolkitVersion: 'latest' },
      ]);
    });

    it('should handle empty slug array', () => {
      const overrides: ToolkitVersionOverrides = new Map([['gmail', '20250901_00']]);
      const specs = buildToolkitVersionSpecs([], overrides);

      expect(specs).toEqual([]);
    });
  });

  describe('groupByVersion', () => {
    it('should group toolkits by version', () => {
      const specs: ToolkitVersionSpec[] = [
        { toolkitSlug: 'gmail', toolkitVersion: '20250901_00' },
        { toolkitSlug: 'slack', toolkitVersion: 'latest' },
        { toolkitSlug: 'github', toolkitVersion: '20250901_00' },
      ];
      const grouped = groupByVersion(specs);

      expect(grouped.get('20250901_00')).toEqual(['gmail', 'github']);
      expect(grouped.get('latest')).toEqual(['slack']);
      expect(grouped.size).toBe(2);
    });

    it('should handle all same version', () => {
      const specs: ToolkitVersionSpec[] = [
        { toolkitSlug: 'gmail', toolkitVersion: 'latest' },
        { toolkitSlug: 'slack', toolkitVersion: 'latest' },
      ];
      const grouped = groupByVersion(specs);

      expect(grouped.size).toBe(1);
      expect(grouped.get('latest')).toEqual(['gmail', 'slack']);
    });

    it('should handle all different versions', () => {
      const specs: ToolkitVersionSpec[] = [
        { toolkitSlug: 'gmail', toolkitVersion: '20250901_00' },
        { toolkitSlug: 'slack', toolkitVersion: '20250815_00' },
        { toolkitSlug: 'github', toolkitVersion: '20250710_00' },
      ];
      const grouped = groupByVersion(specs);

      expect(grouped.size).toBe(3);
      expect(grouped.get('20250901_00')).toEqual(['gmail']);
      expect(grouped.get('20250815_00')).toEqual(['slack']);
      expect(grouped.get('20250710_00')).toEqual(['github']);
    });

    it('should handle empty specs array', () => {
      const specs: ToolkitVersionSpec[] = [];
      const grouped = groupByVersion(specs);

      expect(grouped.size).toBe(0);
    });

    it('should preserve order within version groups', () => {
      const specs: ToolkitVersionSpec[] = [
        { toolkitSlug: 'gmail', toolkitVersion: 'latest' },
        { toolkitSlug: 'slack', toolkitVersion: 'latest' },
        { toolkitSlug: 'github', toolkitVersion: 'latest' },
        { toolkitSlug: 'notion', toolkitVersion: 'latest' },
      ];
      const grouped = groupByVersion(specs);

      expect(grouped.get('latest')).toEqual(['gmail', 'slack', 'github', 'notion']);
    });
  });
});
