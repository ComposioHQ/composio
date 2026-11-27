import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import { Effect, FileSystem, Option, Path, Schema, Stdio } from 'effect';
import { Digest } from 'effect/crypto';
import { Base64 } from 'effect/encoding';
import { HttpClient, HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { PackedManifest, tarballName } from './candidates';
import { readVerifiedCandidate } from './consumers';
import { NPM_REGISTRY } from './lanes';
import {
  ensure,
  fail,
  formatJson,
  readJson,
  run,
  runMain,
  withoutReleaseTokens,
  writeFile,
} from './runtime';
import { BATCH_PATH, ReleaseBatch } from './source';

type PlannedPackage = Pick<ReleaseBatch['plan']['releases'][number], 'name' | 'newVersion'>;

export interface CandidatePackage {
  readonly manifest: typeof PackedManifest.Type;
  readonly bytes: Uint8Array;
  readonly integrity: string;
}

/**
 * Reads the planned packages from a downloaded TypeScript candidate. Every file is checked
 * against the candidate manifest first, so the registry never serves bytes the candidate job did
 * not build.
 */
export const loadCandidatePackages = (
  candidates: string,
  releases: ReadonlyArray<PlannedPackage>
) =>
  Effect.gen(function* () {
    const digest = yield* Digest.Digest;
    const { manifest, files } = yield* readVerifiedCandidate(candidates);
    yield* ensure(manifest.language === 'typescript', 'Expected the TypeScript candidate');
    return yield* Effect.forEach(releases, release =>
      Effect.gen(function* () {
        const file = tarballName(release.name, release.newVersion);
        const bytes = files.get(file);
        if (!bytes) return yield* fail(`Missing candidate tarball: ${file}`);
        const packed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PackedManifest))(
          yield* run('tar', ['-xOf', `${candidates}/${file}`, 'package/package.json'], {
            env: withoutReleaseTokens,
          })
        );
        yield* ensure(
          packed.name === release.name && packed.version === release.newVersion,
          `Candidate ${file} does not contain ${release.name}@${release.newVersion}`
        );
        const integrity = `sha512-${Base64.encode(yield* digest.digest(Digest.sha512, bytes))}`;
        return { manifest: packed, bytes, integrity } satisfies CandidatePackage;
      })
    );
  });

/** The npm package a registry path names: `@scope/name/-/name-1.0.0.tgz` names `@scope/name`. */
const packageOf = (path: string) => {
  const [first = '', second = ''] = path.split('/');
  return first.startsWith('@') ? `${first}/${second}` : first;
};

/**
 * Starts an npm registry on localhost for the current scope. It serves the planned packages from
 * their candidate tarballs, at the candidate version only, and proxies every other package to
 * `upstream`. A planned package never falls through to `upstream`, so no copy can resolve to a
 * published version. Returns the registry URL.
 */
export const serveCandidateRegistry = (
  packages: ReadonlyArray<CandidatePackage>,
  upstream: string = NPM_REGISTRY
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const server = yield* BunHttpServer.make({ port: 0, hostname: '127.0.0.1' });
    const origin = HttpServer.formatAddress(server.address);
    const packuments = new Map<string, unknown>();
    const tarballs = new Map<string, Uint8Array>();
    for (const { manifest, bytes, integrity } of packages) {
      const tarball = `${manifest.name}/-/${manifest.name.split('/').at(-1)}-${manifest.version}.tgz`;
      tarballs.set(tarball, bytes);
      packuments.set(manifest.name, {
        name: manifest.name,
        'dist-tags': { latest: manifest.version },
        versions: {
          [manifest.version]: { ...manifest, dist: { tarball: `${origin}/${tarball}`, integrity } },
        },
      });
    }
    yield* server.serve(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url, origin);
        // Clients spell a scoped packument as `@scope%2fname` or `@scope/name`.
        const path = decodeURIComponent(url.pathname).slice(1);
        const packument = packuments.get(path);
        if (packument) return HttpServerResponse.jsonUnsafe(packument);
        const tarball = tarballs.get(path);
        if (tarball)
          return HttpServerResponse.uint8Array(tarball, {
            contentType: 'application/octet-stream',
          });
        if (request.method !== 'GET' || packuments.has(packageOf(path)))
          return HttpServerResponse.empty({ status: 404 });
        const response = yield* client.get(`${upstream}${url.pathname}${url.search}`, {
          headers: { accept: request.headers.accept ?? '*/*' },
        });
        return HttpServerResponse.uint8Array(new Uint8Array(yield* response.arrayBuffer), {
          status: response.status,
          contentType: response.headers['content-type'],
        });
      })
    );
    return origin;
  });

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;
const Dependencies = Schema.optionalKey(Schema.Record(Schema.String, Schema.String));
const DocsManifest = Schema.StructWithRest(
  Schema.Struct({
    dependencies: Dependencies,
    devDependencies: Dependencies,
    optionalDependencies: Dependencies,
    overrides: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);

/**
 * Pins the planned packages to their candidate versions in this checkout's docs manifest, as
 * direct dependencies and as overrides for every nested copy. The committed docs pins name
 * published versions; this job-local edit is never committed. Returns the planned packages the
 * docs depend on directly.
 */
export const pinCandidateVersions = (
  manifestPath: string,
  releases: ReadonlyArray<PlannedPackage>
) =>
  Effect.gen(function* () {
    const manifest = yield* readJson(DocsManifest, manifestPath);
    const pins = Object.fromEntries(releases.map(release => [release.name, release.newVersion]));
    const direct = releases
      .map(release => release.name)
      .filter(name => DEPENDENCY_FIELDS.some(field => manifest[field]?.[name] !== undefined));
    const pinned: Record<string, unknown> = {
      ...manifest,
      overrides: { ...manifest.overrides, ...pins },
    };
    for (const field of DEPENDENCY_FIELDS) {
      const dependencies = manifest[field];
      if (!dependencies) continue;
      pinned[field] = Object.fromEntries(
        Object.entries(dependencies).map(([name, range]) => [name, pins[name] ?? range])
      );
    }
    yield* writeFile(manifestPath, formatJson(pinned));
    return direct;
  });

const Versioned = Schema.Struct({ version: Schema.String });

const installedCopies = (nodeModules: string, names: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const copies: { name: string; directory: string; version: string }[] = [];
    const pending = [nodeModules];
    for (let directory = pending.pop(); directory !== undefined; directory = pending.pop()) {
      const info = yield* Effect.option(fs.stat(directory));
      if (Option.isNone(info) || info.value.type !== 'Directory') continue;
      for (const entry of yield* fs.readDirectory(directory)) {
        // The isolated linker keeps each package under `.bun/<name>@<version>/node_modules`.
        if (entry === '.bun') {
          for (const store of yield* fs.readDirectory(path.join(directory, entry)))
            pending.push(path.join(directory, entry, store, 'node_modules'));
          continue;
        }
        const packageNames = entry.startsWith('@')
          ? (yield* fs.readDirectory(path.join(directory, entry))).map(
              scoped => `${entry}/${scoped}`
            )
          : [entry];
        for (const name of packageNames) {
          const packageDirectory = path.join(directory, name);
          if (names.has(name))
            copies.push({
              name,
              directory: packageDirectory,
              version: (yield* readJson(Versioned, path.join(packageDirectory, 'package.json')))
                .version,
            });
          pending.push(path.join(packageDirectory, 'node_modules'));
        }
      }
    }
    return copies;
  });

/**
 * Fails unless every installed copy of a planned package is its candidate version and each
 * planned package in `required` is installed at all.
 */
export const assertCandidateVersions = (
  nodeModules: string,
  releases: ReadonlyArray<PlannedPackage>,
  required: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const versions = new Map(releases.map(release => [release.name, release.newVersion]));
    const copies = yield* installedCopies(nodeModules, new Set(versions.keys()));
    const problems = [
      ...required
        .filter(name => !copies.some(copy => copy.name === name))
        .map(name => `${name} is not installed`),
      ...copies
        .filter(copy => copy.version !== versions.get(copy.name))
        .map(copy => `${copy.directory} is ${copy.version}, not ${versions.get(copy.name)}`),
    ];
    yield* ensure(
      problems.length === 0,
      `The docs did not install the candidate packages:\n${problems.join('\n')}`
    );
  });

const bun = (docs: string, args: ReadonlyArray<string>, env: Record<string, string> = {}) =>
  run('bun', args, { cwd: docs, env: { ...withoutReleaseTokens, ...env }, output: 'inherit' });

/**
 * Installs the docs dependencies for a stable release PR. Without a TypeScript release, the
 * committed lock is installed from npm as is. Otherwise the planned packages come from the
 * candidate through a job-local registry, every other package through its npm proxy, and every
 * installed copy of a planned package must be its candidate version.
 */
export const installCandidateDocs = (docs: string, batch: ReleaseBatch, candidates: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const npm = batch.plan.releases.filter(release => release.language === 'typescript');
      if (npm.length === 0) return yield* bun(docs, ['install', '--frozen-lockfile']);
      const packages = yield* loadCandidatePackages(candidates, npm);
      const registry = yield* serveCandidateRegistry(packages);
      const direct = yield* pinCandidateVersions(path.join(docs, 'package.json'), npm);
      // A fresh cache, so no planned package is reused from an earlier install.
      const cache = yield* fs.makeTempDirectoryScoped({ prefix: 'sdk-candidate-docs-cache-' });
      yield* bun(docs, ['install'], {
        NPM_CONFIG_REGISTRY: registry,
        BUN_INSTALL_CACHE_DIR: cache,
      });
      yield* assertCandidateVersions(path.join(docs, 'node_modules'), npm, direct);
    })
  );

/** `candidate-registry.ts <candidate-dir>` installs the docs against a stable release's candidate. */
const main = Effect.gen(function* () {
  const path = yield* Path.Path;
  const [candidates] = yield* Schema.decodeUnknownEffect(Schema.Tuple([Schema.String]))(
    yield* (yield* Stdio.Stdio).args
  );
  const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
  yield* installCandidateDocs(path.resolve('docs'), batch, path.resolve(candidates));
});

if (import.meta.main) runMain(main);
