import { join } from 'node:path';
import { Config, Console, Effect, Schema } from 'effect';
import { promoteSnapshot, snapshotDirectory } from '../../docs/lib/sdk-reference-snapshot';
import { LANGUAGES, PYTHON_RELEASE_MARKER, REGISTRY_VERSION, type Language } from './lanes';
import { readJson, runMain } from './runtime';
import { BATCH_PATH, channelOf, ReleaseBatch } from './source';

const CORE_PACKAGES: Record<Language, string> = {
  typescript: '@composio/core',
  python: PYTHON_RELEASE_MARKER,
};

export function publishedReferenceVersions(
  batch: ReleaseBatch,
  published: Readonly<Record<Language, boolean>>
): Partial<Record<Language, string>> {
  if (!channelOf(batch).pinsDocs) return {};
  const versions: Partial<Record<Language, string>> = {};
  for (const language of LANGUAGES) {
    if (!published[language]) continue;
    const release = batch.plan.releases.find(item => item.name === CORE_PACKAGES[language]);
    if (release) versions[language] = REGISTRY_VERSION[language](release.newVersion);
  }
  return versions;
}

const main = Effect.gen(function* () {
  const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
  const sourceCommit = yield* Config.schema(
    Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/)),
    'GITHUB_SHA'
  );
  const published = yield* Config.all({
    typescript: Config.Boolean('NPM_VERIFIED'),
    python: Config.Boolean('PYPI_VERIFIED'),
  });
  const versions = publishedReferenceVersions(batch, published);
  for (const language of LANGUAGES) {
    const version = versions[language];
    if (version === undefined) continue;
    const promoted = yield* Effect.try(() =>
      promoteSnapshot(
        snapshotDirectory(join('next', 'docs'), language),
        join('docs/content/reference/sdk-reference', language),
        version,
        sourceCommit
      )
    );
    if (promoted) yield* Console.log(`Prepared ${language} SDK reference ${version}`);
  }
});

if (import.meta.main) runMain(main);
