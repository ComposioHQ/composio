import { describe, it, expect } from 'vitest';
import path from 'node:path';
import * as tempy from 'tempy';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import { BunFileSystem } from '@effect/platform-bun';
import { FileSystem } from '@effect/platform';
import { ProjectKeyRegistry, InvalidProjectIdError } from 'src/services/project-key-registry';
import { NodeOs, defaultNodeOs } from 'src/services/node-os';
import { extendConfigProvider } from 'src/services/config';

/**
 * Creates a test layer for ProjectKeyRegistry backed by a temp directory.
 */
const makeTestLayer = (homedir: string) => {
  const NodeOsTest = Layer.succeed(NodeOs, defaultNodeOs({ homedir }));
  const configProvider = extendConfigProvider(ConfigProvider.fromMap(new Map([])));

  return Layer.provide(
    ProjectKeyRegistry.Default,
    Layer.mergeAll(BunFileSystem.layer, NodeOsTest, Layer.setConfigProvider(configProvider))
  );
};

describe('ProjectKeyRegistry', () => {
  describe('register', () => {
    it('creates _keys/ dir and writes <projectId>.json', () => {
      const cwd = tempy.temporaryDirectory();
      return Effect.gen(function* () {
        const registry = yield* ProjectKeyRegistry;
        const fs = yield* FileSystem.FileSystem;

        yield* registry.register({
          orgId: 'org-123',
          projectId: 'proj-456',
          projectName: Option.some('My Project'),
          orgName: Option.some('My Org'),
          email: Option.some('test@test.com'),
        });

        const keysDir = path.join(cwd, '.composio', '_keys');
        const exists = yield* fs.exists(path.join(keysDir, 'proj-456.json'));
        expect(exists).toBe(true);

        const content = yield* fs.readFileString(path.join(keysDir, 'proj-456.json'));
        const parsed = JSON.parse(content);
        expect(parsed.org_id).toBe('org-123');
        expect(parsed.project_id).toBe('proj-456');
        expect(parsed.project_name).toBe('My Project');
        expect(parsed.org_name).toBe('My Org');
        expect(parsed.email).toBe('test@test.com');
      }).pipe(
        Effect.provide(Layer.mergeAll(makeTestLayer(cwd), BunFileSystem.layer)),
        Effect.runPromise
      );
    });

    it('overwrites existing file for same projectId', () => {
      const cwd = tempy.temporaryDirectory();
      return Effect.gen(function* () {
        const registry = yield* ProjectKeyRegistry;
        const fs = yield* FileSystem.FileSystem;

        yield* registry.register({
          orgId: 'org-old',
          projectId: 'proj-1',
          projectName: Option.none(),
          orgName: Option.none(),
          email: Option.none(),
        });

        yield* registry.register({
          orgId: 'org-new',
          projectId: 'proj-1',
          projectName: Option.some('Updated'),
          orgName: Option.none(),
          email: Option.none(),
        });

        const content = yield* fs.readFileString(
          path.join(cwd, '.composio', '_keys', 'proj-1.json')
        );
        const parsed = JSON.parse(content);
        expect(parsed.org_id).toBe('org-new');
        expect(parsed.project_name).toBe('Updated');
      }).pipe(
        Effect.provide(Layer.mergeAll(makeTestLayer(cwd), BunFileSystem.layer)),
        Effect.runPromise
      );
    });

    it('rejects projectId with path traversal characters', () => {
      const cwd = tempy.temporaryDirectory();
      return Effect.gen(function* () {
        const registry = yield* ProjectKeyRegistry;

        const result = yield* registry
          .register({
            orgId: 'org-1',
            projectId: '../../etc/passwd',
            projectName: Option.none(),
            orgName: Option.none(),
            email: Option.none(),
          })
          .pipe(Effect.catchAll(e => Effect.succeed(e)));

        expect(result).toBeInstanceOf(InvalidProjectIdError);
      }).pipe(Effect.provide(makeTestLayer(cwd)), Effect.runPromise);
    });

    it('rejects projectId with dots', () => {
      const cwd = tempy.temporaryDirectory();
      return Effect.gen(function* () {
        const registry = yield* ProjectKeyRegistry;

        const result = yield* registry
          .register({
            orgId: 'org-1',
            projectId: 'file.name',
            projectName: Option.none(),
            orgName: Option.none(),
            email: Option.none(),
          })
          .pipe(Effect.catchAll(e => Effect.succeed(e)));

        expect(result).toBeInstanceOf(InvalidProjectIdError);
      }).pipe(Effect.provide(makeTestLayer(cwd)), Effect.runPromise);
    });
  });

  describe('listAll', () => {
    it('returns empty array when _keys/ does not exist', () => {
      const cwd = tempy.temporaryDirectory();
      return Effect.gen(function* () {
        const registry = yield* ProjectKeyRegistry;
        const result = yield* registry.listAll();
        expect(result).toEqual([]);
      }).pipe(Effect.provide(makeTestLayer(cwd)), Effect.runPromise);
    });

    it('returns all registered profiles', () => {
      const cwd = tempy.temporaryDirectory();
      return Effect.gen(function* () {
        const registry = yield* ProjectKeyRegistry;

        yield* registry.register({
          orgId: 'org-a',
          projectId: 'proj-a',
          projectName: Option.some('Project A'),
          orgName: Option.none(),
          email: Option.none(),
        });
        yield* registry.register({
          orgId: 'org-b',
          projectId: 'proj-b',
          projectName: Option.some('Project B'),
          orgName: Option.none(),
          email: Option.none(),
        });

        const result = yield* registry.listAll();
        expect(result).toHaveLength(2);

        const projectIds = result.map(r => r.projectId).sort();
        expect(projectIds).toEqual(['proj-a', 'proj-b']);
      }).pipe(Effect.provide(makeTestLayer(cwd)), Effect.runPromise);
    });
  });

  describe('removeAll', () => {
    it('is a no-op when _keys/ does not exist', () => {
      const cwd = tempy.temporaryDirectory();
      return Effect.gen(function* () {
        const registry = yield* ProjectKeyRegistry;
        // Should not throw
        yield* registry.removeAll();
      }).pipe(Effect.provide(makeTestLayer(cwd)), Effect.runPromise);
    });

    it('clears all registry entries', () => {
      const cwd = tempy.temporaryDirectory();
      return Effect.gen(function* () {
        const registry = yield* ProjectKeyRegistry;

        yield* registry.register({
          orgId: 'org-a',
          projectId: 'proj-a',
          projectName: Option.none(),
          orgName: Option.none(),
          email: Option.none(),
        });
        yield* registry.register({
          orgId: 'org-b',
          projectId: 'proj-b',
          projectName: Option.none(),
          orgName: Option.none(),
          email: Option.none(),
        });

        const before = yield* registry.listAll();
        expect(before).toHaveLength(2);

        yield* registry.removeAll();

        const after = yield* registry.listAll();
        expect(after).toEqual([]);
      }).pipe(Effect.provide(makeTestLayer(cwd)), Effect.runPromise);
    });
  });
});
