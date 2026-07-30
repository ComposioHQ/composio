import { FileSystem } from '@effect/platform';
import { Data, Effect } from 'effect';
import {
  npmVersionUrl,
  publishablePackages,
  pypiVersionUrl,
  pythonPackage,
  urlExists,
} from './shared.ts';

interface Artifact {
  readonly registry: 'npm' | 'pypi';
  readonly name: string;
  readonly version: string;
  readonly url: string;
}

export class MissingArtifacts extends Data.TaggedError('MissingArtifacts')<{
  readonly missing: ReadonlyArray<Artifact>;
}> {
  override get message() {
    return `Artifacts not live on their registry:\n${describe(this.missing)}`;
  }
}

const describe = (artifacts: ReadonlyArray<Artifact>) =>
  artifacts
    .map(artifact => `- ${artifact.registry}: ${artifact.name}@${artifact.version}`)
    .join('\n');

/** Registries are the source of truth: anything whose current version they do not serve still needs publishing. */
const missingArtifacts = Effect.gen(function* () {
  const packages = yield* publishablePackages;
  const python = yield* pythonPackage;
  const artifacts: ReadonlyArray<Artifact> = [
    ...packages.map(pkg => ({
      registry: 'npm' as const,
      name: pkg.name,
      version: pkg.version,
      url: npmVersionUrl(pkg.name, pkg.version),
    })),
    {
      registry: 'pypi',
      name: python.name,
      version: python.version,
      url: pypiVersionUrl(python.name, python.version),
    },
  ];
  return yield* Effect.filter(artifacts, artifact => Effect.negate(urlExists(artifact.url)), {
    concurrency: 8,
  });
});

/** Report what still needs publishing; exposes `publish_needed` to GitHub Actions when GITHUB_OUTPUT is set. */
export const status = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const missing = yield* missingArtifacts;
  yield* Effect.log(
    missing.length === 0
      ? 'All SDK artifacts are live on npm and PyPI.'
      : `Pending artifacts:\n${describe(missing)}`
  );
  const githubOutput = process.env['GITHUB_OUTPUT'];
  if (githubOutput !== undefined) {
    yield* fs.writeFileString(githubOutput, `publish_needed=${missing.length > 0}\n`, {
      flag: 'a',
    });
  }
});

/** Fail loudly unless every artifact of the current versions is live. */
export const verify = Effect.gen(function* () {
  const missing = yield* missingArtifacts;
  if (missing.length > 0) {
    return yield* new MissingArtifacts({ missing });
  }
  yield* Effect.log('Verified: every SDK artifact is live on its registry.');
});
