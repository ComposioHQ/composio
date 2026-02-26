import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { FileSystem } from '@effect/platform';
import { NodeProcess } from 'src/services/node-process';
import { cli, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio init', () => {
  describe('[Given] --org-id + --project-id flags', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] it initializes project config and prints machine output', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const proc = yield* NodeProcess;

          yield* cli(['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes']);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('-- composio init --');
          expect(output).toContain('Project initialized in');
          expect(output).toContain('"org_id":"org1"');
          expect(output).toContain('"project_id":"proj1"');

          const projectConfigPath = path.join(proc.cwd, '.composio', 'project.json');
          const exists = yield* fs.exists(projectConfigPath);
          expect(exists).toBe(true);

          const projectConfigRaw = yield* fs.readFileString(projectConfigPath, 'utf8');
          const projectConfig = JSON.parse(projectConfigRaw) as Record<string, unknown>;
          expect(projectConfig.org_id).toBe('org1');
          expect(projectConfig.project_id).toBe('proj1');

          // Verify no .env.local was created (env vars are printed, not written)
          const envLocalPath = path.join(proc.cwd, '.env.local');
          const envLocalExists = yield* fs.exists(envLocalPath);
          expect(envLocalExists).toBe(false);
        })
      );
    });
  });

  describe('[Given] explicit project ids but no global credentials', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] it warns and skips env var display', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const proc = yield* NodeProcess;

          yield* cli(['init', '--org-id', 'org1', '--project-id', 'proj1']);

          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          // Environment variables are not printed when there is no global API key
          expect(output).not.toContain('Environment variables');
          expect(output).not.toContain('COMPOSIO_API_KEY');

          // Verify no .env.local was created
          const envLocalPath = path.join(proc.cwd, '.env.local');
          const envLocalExists = yield* fs.exists(envLocalPath);
          expect(envLocalExists).toBe(false);
        })
      );
    });
  });
});
