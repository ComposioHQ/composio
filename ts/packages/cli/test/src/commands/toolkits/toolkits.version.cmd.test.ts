import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Toolkits, ToolkitDetailed } from 'src/models/toolkits';

const versionHistory = Array.from({ length: 25 }, (_, index) => {
  const suffix = String(index + 1).padStart(2, '0');
  return `20260101_${suffix}`;
});

const testToolkits: Toolkits = [
  {
    name: 'Gmail',
    slug: 'gmail',
    auth_schemes: ['OAUTH2'],
    composio_managed_auth_schemes: ['OAUTH2'],
    is_local_toolkit: false,
    no_auth: false,
    meta: {
      description: 'Email service to send and receive emails',
      categories: [],
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
      available_versions: versionHistory,
      tools_count: 36,
      triggers_count: 2,
    },
  },
];

const detailedToolkits: ToolkitDetailed[] = [
  {
    name: 'Gmail',
    slug: 'gmail',
    is_local_toolkit: false,
    composio_managed_auth_schemes: ['OAUTH2'],
    no_auth: false,
    meta: {
      description: 'Email service to send and receive emails',
      categories: [],
      created_at: new Date('2024-05-03T11:44:32.061Z') as any,
      updated_at: new Date('2024-05-03T11:44:32.061Z') as any,
      available_versions: versionHistory,
      tools_count: 36,
      triggers_count: 2,
    },
    auth_config_details: [],
  },
];

const toolkitsData = {
  toolkits: testToolkits,
  detailedToolkits,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const parseLastJson = (lines: ReadonlyArray<string>) => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    try {
      return JSON.parse(line) as {
        slug: string;
        latest_version: string | null;
        available_versions_last_20: string[];
      };
    } catch {
      // keep searching for the last JSON line
    }
  }
  throw new Error('Expected JSON output but none found');
};

describe('CLI: composio toolkits version', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] valid slug [Then] shows latest and last 20 versions',
    it => {
      it.scoped('prints latest version and truncates to last 20', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'version', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');
          const json = parseLastJson(lines);

          expect(output).toContain('Toolkit: Gmail (gmail)');
          expect(output).toContain('Latest Version: 20260101_25');
          expect(output).toContain('Last 20 Available Versions:');
          expect(json.slug).toBe('gmail');
          expect(json.latest_version).toBe('20260101_25');
          expect(json.available_versions_last_20).toHaveLength(20);
          expect(json.available_versions_last_20[0]).toBe('20260101_06');
          expect(json.available_versions_last_20[19]).toBe('20260101_25');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] invalid slug [Then] shows error and hint',
    it => {
      it.scoped('prints fetch failure and browse hint', () =>
        Effect.gen(function* () {
          yield* cli(['toolkits', 'version', 'unknown']).pipe(Effect.either);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Toolkit "unknown" not found');
          expect(output).toContain('composio toolkits list');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['toolkits', 'version', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });
});
