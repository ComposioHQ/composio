import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, FileSystem, Layer, Option } from 'effect';
import { vi } from 'vitest';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { ProjectContext } from 'src/services/project-context';

// These paths belong to the in-memory FileSystem, never the host filesystem.
const home = '/home/developer';
const directory = `${home}/project`;
const jsonPath = `${directory}/.composio/project.json`;
const scope = { COMPOSIO_ORG_ID: 'org_test', COMPOSIO_PROJECT_ID: 'proj_test' };
const dotenv = 'COMPOSIO_ORG_ID=org_test\nCOMPOSIO_PROJECT_ID=proj_test\n';
const profile = {
  org_id: 'org_test',
  project_id: 'proj_test',
  project_name: 'Directory project',
  test_user_id: 'project-user',
};

const resolveProject = (
  files: ReadonlyMap<string, string>,
  env: Record<string, string> = {},
  cwd = directory
) =>
  Effect.gen(function* () {
    const context = yield* ProjectContext;
    return yield* context.resolve;
  }).pipe(
    Effect.provide(
      ProjectContext.Default.pipe(
        Layer.provide(
          Layer.mergeAll(
            FileSystem.layerNoop({
              exists: path => Effect.succeed(files.has(path)),
              readFileString: path => Effect.succeed(files.get(path) ?? ''),
            }),
            Layer.succeed(
              NodeOs,
              NodeOs.of({ homedir: home, tmpdir: home, platform: 'linux', arch: 'x64' })
            ),
            Layer.succeed(
              NodeProcess,
              NodeProcess.of({
                cwd,
                execPath: '/in-memory/composio',
                platform: 'linux',
                arch: 'x64',
                setExitCode: () => Effect.void,
              })
            )
          )
        )
      )
    ),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord(env))
  );

const sources: ReadonlyArray<{
  name: string;
  env: Record<string, string>;
  files: ReadonlyArray<readonly [string, string]>;
  inheritsDirectoryUser: boolean;
}> = [
  { name: 'process environment', env: scope, files: [], inheritsDirectoryUser: false },
  {
    name: '.composio/.env',
    env: {},
    files: [[`${directory}/.composio/.env`, dotenv]],
    inheritsDirectoryUser: true,
  },
];

const profiles = [
  { name: 'matching profile', json: JSON.stringify(profile), expectedUser: 'project-user' },
  {
    name: 'another project',
    json: JSON.stringify({ ...profile, project_id: 'proj_other' }),
    expectedUser: null,
  },
  {
    name: 'another org',
    json: JSON.stringify({ ...profile, org_id: 'org_other' }),
    expectedUser: null,
  },
  {
    name: 'profile without test user',
    json: JSON.stringify({ org_id: 'org_test', project_id: 'proj_test' }),
    expectedUser: null,
  },
  { name: 'missing profile', json: undefined, expectedUser: null },
  { name: 'invalid profile', json: '{', expectedUser: null },
];

const cases = sources.flatMap(source =>
  profiles.map(profile => ({ source, profile, name: `${source.name}: ${profile.name}` }))
);

describe('ProjectContext test user metadata', () => {
  it.effect.each(cases)('$name', ({ source, profile }) =>
    Effect.gen(function* () {
      const files = new Map(source.files);
      if (profile.json !== undefined) files.set(jsonPath, profile.json);
      const result = yield* resolveProject(files, source.env);
      const keys = Option.getOrThrow(result);
      expect(keys.orgId).toBe('org_test');
      expect(keys.projectId).toBe('proj_test');
      expect(Option.getOrNull(keys.testUserId)).toBe(
        source.inheritsDirectoryUser ? profile.expectedUser : null
      );
      expect(Option.isNone(keys.projectName)).toBe(true);
    })
  );

  it.effect.each(sources)('$name: preserves test-user policy from a subdirectory', source =>
    Effect.gen(function* () {
      const files = new Map([...source.files, [jsonPath, JSON.stringify(profile)]]);
      const result = yield* resolveProject(files, source.env, `${directory}/nested`);
      expect(Option.getOrNull(Option.flatMap(result, keys => keys.testUserId))).toBe(
        source.inheritsDirectoryUser ? 'project-user' : null
      );
    })
  );

  it.effect.each(sources)('$name: does not borrow from beyond the nearest project', source =>
    Effect.gen(function* () {
      const files = new Map([
        ...source.files,
        [jsonPath, JSON.stringify({ ...profile, project_id: 'proj_other' })],
        [`${home}/.composio/project.json`, JSON.stringify(profile)],
      ]);
      const result = yield* resolveProject(files, source.env);
      expect(Option.getOrNull(Option.flatMap(result, keys => keys.testUserId))).toBeNull();
    })
  );

  it.effect.each(sources)('$name: does not read profiles above the home directory', source =>
    Effect.gen(function* () {
      const files = new Map([
        ...source.files,
        ['/.composio/project.json', JSON.stringify(profile)],
      ]);
      const result = yield* resolveProject(files, source.env);
      expect(Option.getOrNull(Option.flatMap(result, keys => keys.testUserId))).toBeNull();
    })
  );

  it.effect('keeps project.json-only resolution unchanged', () =>
    Effect.gen(function* () {
      const result = yield* resolveProject(new Map([[jsonPath, JSON.stringify(profile)]]));
      const keys = Option.getOrThrow(result);
      expect(keys.projectId).toBe('proj_test');
      expect(Option.getOrNull(keys.testUserId)).toBe('project-user');
      expect(Option.getOrNull(keys.projectName)).toBe('Directory project');
    })
  );

  it.effect('returns none when no project is configured', () =>
    Effect.gen(function* () {
      expect(Option.isNone(yield* resolveProject(new Map()))).toBe(true);
    })
  );

  it.effect('keeps process environment scope ahead of a different .env scope', () =>
    Effect.gen(function* () {
      const files = new Map([
        [jsonPath, JSON.stringify(profile)],
        [
          `${directory}/.composio/.env`,
          'COMPOSIO_ORG_ID=org_other\nCOMPOSIO_PROJECT_ID=proj_other\n',
        ],
      ]);
      const result = yield* resolveProject(files, scope);
      const keys = Option.getOrThrow(result);
      expect(keys.orgId).toBe('org_test');
      expect(keys.projectId).toBe('proj_test');
      expect(Option.getOrNull(keys.testUserId)).toBeNull();
    })
  );

  it.effect.each([directory, home])(
    'process environment ignores repository files, including a forged profile in %s',
    profileDirectory =>
      Effect.gen(function* () {
        const files = new Map([
          [
            `${profileDirectory}/.composio/project.json`,
            JSON.stringify({ ...profile, test_user_id: 'attacker-selected-user' }),
          ],
          [`${directory}/.composio/.env`, dotenv],
        ]);
        const hasFile = vi.spyOn(files, 'has');
        const readFile = vi.spyOn(files, 'get');
        const keys = Option.getOrThrow(yield* resolveProject(files, scope));
        expect(keys.orgId).toBe(scope.COMPOSIO_ORG_ID);
        expect(keys.projectId).toBe(scope.COMPOSIO_PROJECT_ID);
        expect(Option.isNone(keys.testUserId)).toBe(true);
        expect(hasFile).not.toHaveBeenCalled();
        expect(readFile).not.toHaveBeenCalled();
      })
  );
});
