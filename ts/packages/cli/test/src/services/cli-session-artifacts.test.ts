import { FileSystem, Path } from '@effect/platform';
import { describe, expect, layer } from '@effect/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { ConfigProvider, Effect, Option } from 'effect';
import * as tempy from 'tempy';
import {
  appendCliSessionHistory,
  resolveArtifactsRoot,
  resolveCliSessionArtifacts,
  storeCliSessionArtifact,
} from 'src/services/cli-session-artifacts';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { extendConfigProvider } from 'src/services/config';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { TestLive } from 'test/__utils__';

const cacheEnabledTestConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE', 'false']])
).pipe(
  ConfigProvider.orElse(() => ConfigProvider.fromEnv()),
  extendConfigProvider
);

const environmentTestConfigProvider = ConfigProvider.fromEnv().pipe(extendConfigProvider);

describe('CLI session artifacts', () => {
  beforeEach(() => {
    vi.stubEnv('COMPOSIO_SESSION_DIR', undefined);
    vi.stubEnv('COMPOSIO_CACHE_DIR', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  layer(TestLive({ baseConfigProvider: environmentTestConfigProvider }))(it => {
    it.scoped('resolves artifact roots in documented precedence order', () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const config = yield* ComposioCliUserConfig;
        const sessionRoot = tempy.temporaryDirectory();
        const cacheRoot = tempy.temporaryDirectory();
        const configuredRoot = tempy.temporaryDirectory();
        const temporaryRoot = tempy.temporaryDirectory();
        const root = resolveArtifactsRoot.pipe(
          Effect.provideService(
            NodeOs,
            defaultNodeOs({ homedir: tempy.temporaryDirectory(), tmpdir: temporaryRoot })
          )
        );

        yield* config.update({ artifactDirectory: Option.some(configuredRoot) });
        vi.stubEnv('COMPOSIO_SESSION_DIR', sessionRoot);
        vi.stubEnv('COMPOSIO_CACHE_DIR', cacheRoot);
        expect(yield* root).toBe(sessionRoot);

        vi.stubEnv('COMPOSIO_SESSION_DIR', ' ');
        expect(yield* root).toBe(cacheRoot);

        vi.stubEnv('COMPOSIO_CACHE_DIR', ' ');
        expect(yield* root).toBe(configuredRoot);

        yield* config.update({ artifactDirectory: Option.none() });
        expect(yield* root).toBe(path.join(temporaryRoot, 'composio'));
      })
    );

    it.scoped('stores a sanitized artifact with the requested extension', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directoryPath = yield* fs.makeTempDirectoryScoped();

        const filePath = yield* storeCliSessionArtifact({
          contents: '{"ok":true}',
          name: 'github issue output',
          extension: '.json',
          directoryPath,
        });

        expect(filePath).toBeDefined();
        if (filePath === undefined) {
          return yield* Effect.die('Expected the session artifact to be stored');
        }
        expect(path.dirname(filePath)).toBe(directoryPath);
        expect(path.basename(filePath)).toMatch(/^github_issue_output_[a-f0-9]{8}\.json$/i);
        expect(yield* fs.readFileString(filePath)).toBe('{"ok":true}');
      })
    );

    it.scoped('returns undefined when the artifact directory cannot be created', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const filePath = yield* fs.makeTempFileScoped();

        expect(
          yield* storeCliSessionArtifact({
            contents: '{}',
            name: 'output',
            directoryPath: filePath,
          })
        ).toBeUndefined();
      })
    );

    it.scoped('stores an adhoc artifact when no CLI session is available', () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const artifactsRoot = tempy.temporaryDirectory();
        vi.stubEnv('COMPOSIO_SESSION_DIR', artifactsRoot);

        const filePath = yield* storeCliSessionArtifact({
          contents: '{}',
          name: 'adhoc output',
        });

        expect(filePath).toBeDefined();
        if (filePath === undefined) {
          return yield* Effect.die('Expected an adhoc artifact');
        }
        const directoryPath = path.dirname(filePath);
        expect(path.dirname(directoryPath)).toBe(artifactsRoot);
        expect(path.basename(directoryPath)).toMatch(/^adhoc_[a-f0-9]{12}$/i);
      })
    );
  });

  layer(TestLive({ baseConfigProvider: cacheEnabledTestConfigProvider }))(it => {
    const sessionScope = {
      orgId: 'org_test',
      consumerUserId: 'consumer-user-test',
    } as const;

    it.scoped('stores artifacts under the current CLI session without a directory override', () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const artifactsRoot = tempy.temporaryDirectory();
        vi.stubEnv('COMPOSIO_SESSION_DIR', artifactsRoot);

        const filePath = yield* storeCliSessionArtifact({
          contents: '{"session":true}',
          name: 'session output',
          ...sessionScope,
        });

        expect(filePath).toBeDefined();
        if (filePath === undefined) {
          return yield* Effect.die('Expected a session-backed artifact');
        }
        const directoryPath = path.dirname(filePath);
        expect(path.dirname(directoryPath)).toBe(artifactsRoot);
        expect(path.basename(directoryPath)).toMatch(/^cli_s_[a-z0-9]+_[a-f0-9]{10}$/i);
      })
    );

    it.scoped('appends multiple JSONL history entries to the same session', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const artifactsRoot = tempy.temporaryDirectory();
        vi.stubEnv('COMPOSIO_SESSION_DIR', artifactsRoot);

        yield* appendCliSessionHistory({ entry: { sequence: 1 }, ...sessionScope });
        yield* appendCliSessionHistory({ entry: { sequence: 2 }, ...sessionScope });
        const artifacts = yield* resolveCliSessionArtifacts(sessionScope);

        expect(Option.isSome(artifacts)).toBe(true);
        if (Option.isNone(artifacts)) {
          return yield* Effect.die('Expected session artifacts');
        }
        const lines = (yield* fs.readFileString(artifacts.value.historyFilePath, 'utf8'))
          .trim()
          .split('\n')
          .map(line => JSON.parse(line) as { sessionId: string; sequence: number });
        expect(lines).toEqual([
          expect.objectContaining({ sessionId: artifacts.value.sessionId, sequence: 1 }),
          expect.objectContaining({ sessionId: artifacts.value.sessionId, sequence: 2 }),
        ]);
      })
    );

    it.scoped('keeps history writes best-effort when the artifact root is not a directory', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const rootFile = yield* fs.makeTempFileScoped();
        vi.stubEnv('COMPOSIO_SESSION_DIR', rootFile);

        yield* appendCliSessionHistory({ entry: { sequence: 1 }, ...sessionScope });

        expect(yield* fs.readFileString(rootFile, 'utf8')).toBe('');
      })
    );
  });
});
