import {
  Config,
  Console,
  Data,
  Effect,
  FileSystem,
  Option,
  Path,
  Predicate,
  Schedule,
  Schema,
  Stdio,
} from 'effect';
import type { Duration } from 'effect';
import { Digest } from 'effect/crypto';
import { Base64 } from 'effect/encoding';
import { FetchHttpClient, HttpClient } from 'effect/http';
import semver from 'semver';
import {
  CANDIDATE_MANIFEST,
  CandidateManifest,
  candidateArtifactName,
  downloadCandidate,
  originalCandidates,
  reuseCandidate,
  verifyCandidateFiles,
  type CandidateArtifact,
  type CandidateFile,
} from './artifacts';
import { verifyReleaseHead } from './approval';
import { GitHub, REPOSITORY_PATH, SDK_RELEASE_REPOSITORY, Sha, getRun, request } from './github';
import { REGISTRY_LANES, type Language } from './lanes';
import { CorrectiveInput } from './plan';
import { discoverPythonPackages } from './python-metadata';
import {
  ensure,
  fail,
  parseJson,
  readJson,
  run,
  runMain,
  sha256Hex,
  withoutReleaseTokens,
} from './runtime';
import { BATCH_PATH, ReleaseBatch } from './source';

export interface PublicationSource {
  readonly sha: string;
  readonly tag: string;
  readonly runId: number;
}

/** One original distribution file: an npm tarball or a Python wheel/sdist. */
export interface Distribution {
  readonly language: Language;
  readonly name: string;
  readonly version: string;
  readonly file: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

export interface StableTag {
  readonly name: string;
  readonly version: string;
}

export interface RegistryState {
  readonly existing: ReadonlyArray<Distribution>;
  readonly missing: ReadonlyArray<Distribution>;
  readonly tagsToRepair: ReadonlyArray<StableTag>;
}

/** A failure that retrying the original run cannot fix; recovery needs a corrective release. */
export class TerminalPublicationError extends Data.TaggedError('TerminalPublicationError')<{
  readonly message: string;
}> {}

const terminal = (message: string) => Effect.fail(new TerminalPublicationError({ message }));
const ensureTerminal = (condition: boolean, message: string) =>
  condition ? Effect.void : terminal(message);
const isTerminal = (error: unknown) => Predicate.isTagged(error, 'TerminalPublicationError');

const NPM_REGISTRY = 'https://registry.npmjs.org';
const WORKFLOW_PATH = '.github/workflows/sdk.release.yml';
const SLSA_PROVENANCE = 'https://slsa.dev/provenance/v1';
const REGISTRY_TIMEOUT = '30 seconds';
const RECOVERY_WINDOW_MS = 30 * 86_400_000;
const MAX_PUBLISHER_ATTEMPTS = 50;

const Url = Schema.String.check(
  Schema.makeFilter(value => (URL.canParse(value) ? undefined : 'Expected a URL'))
);
const PositiveIntFromString = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isGreaterThan(0)
);

const isSuccess = (status: number) => status >= 200 && status < 300;

const registryGet = (url: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return yield* client.get(url);
  }).pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }));

/** Registry metadata at `url`, or `None` when the registry answers 404. */
const registryJson = <S extends Schema.Top>(url: string, schema: S) =>
  Effect.gen(function* () {
    const response = yield* registryGet(url);
    if (response.status === 404) return Option.none<S['Type']>();
    yield* ensure(
      isSuccess(response.status),
      `Registry lookup incomplete: ${url} (${response.status})`
    );
    return Option.some(yield* parseJson(schema, yield* response.text));
  }).pipe(Effect.timeout(REGISTRY_TIMEOUT));

const registryBytes = (url: string, failure: (status: number) => string) =>
  Effect.gen(function* () {
    const response = yield* registryGet(url);
    yield* ensure(isSuccess(response.status), failure(response.status));
    return new Uint8Array(yield* response.arrayBuffer);
  }).pipe(Effect.timeout(REGISTRY_TIMEOUT));

const servedBy = (language: Language, url: string) =>
  URL.canParse(url) &&
  new URL(url).protocol === 'https:' &&
  new URL(url).hostname === REGISTRY_LANES[language].downloadHost;

/** The registry must serve exactly the original candidate bytes. */
const verifyOriginalBytes = (url: string, file: Distribution) =>
  Effect.gen(function* () {
    yield* ensureTerminal(
      servedBy(file.language, url),
      `Unexpected registry download host: ${file.file}`
    );
    const bytes = yield* registryBytes(
      url,
      status => `Registry download incomplete: ${file.file} (${status})`
    );
    yield* ensureTerminal(
      bytes.length === file.bytes.length && (yield* sha256Hex(bytes)) === file.sha256,
      `Registry content conflict: ${file.name}@${file.version}/${file.file}. A newly approved higher-version corrective release is required.`
    );
  });

const Attestations = Schema.Struct({
  attestations: Schema.Array(
    Schema.Struct({
      predicateType: Schema.String,
      bundle: Schema.Struct({ dsseEnvelope: Schema.Struct({ payload: Schema.String }) }),
    })
  ),
});
const ProvenanceStatement = Schema.Struct({
  subject: Schema.Array(
    Schema.Struct({ name: Schema.String, digest: Schema.Struct({ sha512: Schema.String }) })
  ),
  predicate: Schema.Struct({
    buildDefinition: Schema.Struct({
      externalParameters: Schema.Struct({
        workflow: Schema.Struct({
          repository: Schema.String,
          path: Schema.String,
          ref: Schema.String,
        }),
      }),
      resolvedDependencies: Schema.Array(
        Schema.Struct({ uri: Schema.String, digest: Schema.Struct({ gitCommit: Schema.String }) })
      ),
    }),
    runDetails: Schema.Struct({ metadata: Schema.Struct({ invocationId: Schema.String }) }),
  }),
});

/** Checks the SLSA statement's subject and source; `npm audit signatures` verifies the signature itself. */
export const inspectNpmProvenanceSubject = (
  value: unknown,
  file: Distribution,
  source: PublicationSource
) =>
  Effect.gen(function* () {
    const { attestations } = yield* Schema.decodeUnknownEffect(Attestations)(value);
    const entry = attestations.find(candidate => candidate.predicateType === SLSA_PROVENANCE);
    if (!entry)
      return yield* fail(`Native npm provenance incomplete: ${file.name}@${file.version}`);
    const statement = yield* parseJson(
      ProvenanceStatement,
      yield* Effect.fromResult(Base64.decodeString(entry.bundle.dsseEnvelope.payload))
    );
    const digest = yield* Digest.Digest;
    const sha512 = yield* digest.digestHex(Digest.sha512, file.bytes);
    const subject = `pkg:npm/${file.name.replace(/^@/, '%40')}@${file.version}`;
    yield* ensureTerminal(
      statement.subject.some(item => item.name === subject && item.digest.sha512 === sha512),
      `Native npm provenance subject conflict: ${file.name}`
    );
    const { buildDefinition, runDetails } = statement.predicate;
    const workflow = buildDefinition.externalParameters.workflow;
    const repository = `https://github.com/${SDK_RELEASE_REPOSITORY}`;
    yield* ensureTerminal(
      workflow.repository === repository &&
        workflow.path === WORKFLOW_PATH &&
        workflow.ref === `refs/tags/${source.tag}` &&
        buildDefinition.resolvedDependencies.some(
          item =>
            item.uri === `git+${repository}@refs/tags/${source.tag}` &&
            item.digest.gitCommit === source.sha
        ) &&
        runDetails.metadata.invocationId.startsWith(
          `${repository}/actions/runs/${source.runId}/attempts/`
        ),
      `Native npm provenance source conflict: ${file.name}`
    );
  });

const PypiVersion = Schema.Struct({
  urls: Schema.Array(
    Schema.Struct({
      filename: Schema.String,
      url: Url,
      digests: Schema.Struct({ sha256: Schema.String }),
    })
  ),
});
const NpmVersion = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  dist: Schema.Struct({
    tarball: Url,
    attestations: Schema.optionalKey(Schema.Struct({ url: Url })),
  }),
});
const NpmLatest = Schema.Struct({ version: Schema.String });

export const npmTarballName = (name: string, version: string) =>
  `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`;
const pythonDistributionNames = (name: string, version: string) => {
  const prefix = `${name.replaceAll('-', '_')}-${version}`;
  return [`${prefix}-py3-none-any.whl`, `${prefix}.tar.gz`];
};
const pythonPackageOfFile = (file: string, version: string) =>
  file.split(`-${version}`)[0].replaceAll('_', '-');

const versionUrl = (language: Language, name: string, version: string) =>
  REGISTRY_LANES[language].versionUrl(name, version);

interface InventoryTarget {
  readonly name: string;
  readonly version: string;
  readonly language: Language;
}

interface PublishedFile {
  readonly name: string;
  readonly url: string;
  /** Registry-reported SHA-256, when the registry publishes one. */
  readonly sha256?: string;
}

type PlannedRelease = ReleaseBatch['plan']['releases'][number];

interface LoadedCandidate {
  readonly cwd: string;
  readonly batch: ReleaseBatch;
  readonly directory: string;
  readonly manifest: CandidateManifest;
  readonly bytes: ReadonlyMap<string, Uint8Array>;
}

const distributionOf = (
  language: Language,
  identity: { name: string; version: string },
  entry: CandidateFile,
  bytes: ReadonlyMap<string, Uint8Array>
): Distribution => ({
  language,
  name: identity.name,
  version: identity.version,
  file: entry.name,
  bytes: bytes.get(entry.name) ?? new Uint8Array(),
  sha256: entry.sha256,
});

const PackageIdentity = Schema.Struct({ name: Schema.String, version: Schema.String });

/** npm: one tarball per package version, a stable `latest` tag, and native provenance. */
const npmAdapter = {
  reconcileGroup: (group: ReadonlyArray<Distribution>, source: PublicationSource) =>
    Effect.gen(function* () {
      yield* ensureTerminal(group.length === 1, 'Expected exactly one npm tarball per package');
      const [file] = group;
      const metadata = yield* registryJson(
        versionUrl('typescript', file.name, file.version),
        NpmVersion
      );
      if (Option.isSome(metadata)) {
        const { name, version, dist } = metadata.value;
        yield* ensureTerminal(
          name === file.name && version === file.version,
          'Registry npm identity conflict'
        );
        yield* verifyOriginalBytes(dist.tarball, file);
        if (!dist.attestations || new URL(dist.attestations.url).origin !== NPM_REGISTRY)
          return yield* fail(`Native npm provenance incomplete: ${file.name}@${file.version}`);
        const provenance = yield* registryJson(dist.attestations.url, Schema.Unknown);
        yield* inspectNpmProvenanceSubject(Option.getOrUndefined(provenance), file, source);
      }
      const latest = yield* registryJson(
        `${NPM_REGISTRY}/${encodeURIComponent(file.name)}/latest`,
        NpmLatest
      );
      const tagged = Option.getOrUndefined(Option.map(latest, value => value.version));
      yield* ensure(
        tagged === undefined || semver.valid(tagged) !== null,
        `Invalid stable npm tag: ${file.name}`
      );
      return {
        existing: Option.isSome(metadata) ? [file] : [],
        missing: Option.isSome(metadata) ? [] : [file],
        tagsToRepair:
          tagged === undefined || semver.lt(tagged, file.version)
            ? [{ name: file.name, version: file.version }]
            : [],
      } satisfies RegistryState;
    }),
  inventoryTargets: (release: CorrectiveInput['releases'][number], _cwd: string) =>
    Effect.succeed<ReadonlyArray<InventoryTarget>>([
      { name: release.name, version: release.newVersion, language: release.language },
    ]),
  publishedFiles: (target: InventoryTarget) =>
    registryJson(
      versionUrl('typescript', target.name, target.version),
      Schema.Struct({ dist: Schema.Struct({ tarball: Url }) })
    ).pipe(
      Effect.map(metadata =>
        Option.match(metadata, {
          onNone: () => [],
          onSome: (value): ReadonlyArray<PublishedFile> => [
            { name: npmTarballName(target.name, target.version), url: value.dist.tarball },
          ],
        })
      )
    ),
  candidateDistributions: (candidate: LoadedCandidate) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const releases = candidate.batch.plan.releases.filter(
        release => release.language === 'typescript'
      );
      const files: Distribution[] = [];
      for (const entry of candidate.manifest.files) {
        const manifest = yield* parseJson(
          PackageIdentity,
          yield* run(
            'tar',
            ['-xOf', path.join(candidate.directory, entry.name), 'package/package.json'],
            {
              cwd: candidate.cwd,
              env: withoutReleaseTokens,
            }
          )
        );
        yield* ensureTerminal(
          releases.some(
            release => release.name === manifest.name && release.newVersion === manifest.version
          ),
          'Candidate contains an unplanned npm package'
        );
        files.push(distributionOf('typescript', manifest, entry, candidate.bytes));
      }
      yield* ensureTerminal(
        candidate.manifest.files.length === releases.length,
        'Candidate npm package inventory differs'
      );
      return files;
    }),
  statusTarget: (file: string, releases: ReadonlyArray<PlannedRelease>) =>
    Option.map(
      Option.fromNullishOr(
        releases.find(
          release =>
            release.language === 'typescript' &&
            file === npmTarballName(release.name, release.newVersion)
        )
      ),
      release => ({ name: release.name, version: release.newVersion })
    ),
};

/** PyPI: a wheel and sdist for every package of the synchronized Python train. */
const pythonAdapter = {
  reconcileGroup: (group: ReadonlyArray<Distribution>, _source: PublicationSource) =>
    Effect.gen(function* () {
      const [first] = group;
      const metadata = yield* registryJson(
        versionUrl('python', first.name, first.version),
        PypiVersion
      );
      const published = Option.match(metadata, { onNone: () => [], onSome: value => value.urls });
      yield* ensureTerminal(
        new Set(published.map(file => file.filename)).size === published.length &&
          published.every(file => group.some(candidate => candidate.file === file.filename)),
        `Unreviewed PyPI file for ${first.name}@${first.version}; corrective release required`
      );
      const existing: Distribution[] = [];
      const missing: Distribution[] = [];
      for (const file of group) {
        const match = published.find(item => item.filename === file.file);
        if (!match) {
          missing.push(file);
          continue;
        }
        yield* ensureTerminal(
          match.digests.sha256 === file.sha256,
          `Registry content conflict: ${file.file}`
        );
        yield* verifyOriginalBytes(match.url, file);
        existing.push(file);
      }
      return { existing, missing, tagsToRepair: [] } satisfies RegistryState;
    }),
  inventoryTargets: (release: CorrectiveInput['releases'][number], cwd: string) =>
    Effect.map(discoverPythonPackages(cwd), (packages): ReadonlyArray<InventoryTarget> =>
      packages.map(pkg => ({ name: pkg.name, version: release.newVersion, language: 'python' }))
    ),
  publishedFiles: (target: InventoryTarget) =>
    registryJson(versionUrl('python', target.name, target.version), PypiVersion).pipe(
      Effect.map(metadata =>
        Option.match(metadata, {
          onNone: () => [],
          onSome: (value): ReadonlyArray<PublishedFile> =>
            value.urls.map(file => ({
              name: file.filename,
              url: file.url,
              sha256: file.digests.sha256,
            })),
        })
      )
    ),
  candidateDistributions: (candidate: LoadedCandidate) =>
    Effect.gen(function* () {
      const release = candidate.batch.plan.releases.find(entry => entry.language === 'python');
      const version = release?.newVersion ?? '';
      const files: Distribution[] = [];
      for (const pkg of yield* discoverPythonPackages(candidate.cwd))
        for (const name of pythonDistributionNames(pkg.name, version)) {
          const entry = candidate.manifest.files.find(file => file.name === name);
          if (!entry) return yield* terminal(`Original Python distribution missing: ${name}`);
          files.push(distributionOf('python', { name: pkg.name, version }, entry, candidate.bytes));
        }
      yield* ensureTerminal(
        candidate.manifest.files.length === files.length,
        'Candidate Python file inventory differs'
      );
      return files;
    }),
  statusTarget: (file: string, releases: ReadonlyArray<PlannedRelease>) =>
    Option.map(
      Option.fromNullishOr(releases.find(release => release.language === 'python')),
      release => ({
        name: pythonPackageOfFile(file, release.newVersion),
        version: release.newVersion,
      })
    ),
};

const REGISTRY_ADAPTERS = { typescript: npmAdapter, python: pythonAdapter } as const;

/** Maps a candidate file reported in a status run to the selected release it belongs to. */
export const statusDistribution = (
  language: Language,
  file: CandidateFile,
  bytes: ReadonlyMap<string, Uint8Array>,
  releases: ReadonlyArray<PlannedRelease>
) =>
  Option.map(REGISTRY_ADAPTERS[language].statusTarget(file.name, releases), identity =>
    distributionOf(language, identity, file, bytes)
  );

/** Splits original files into those the registry already serves and those still missing. */
export const reconcileRegistry = (files: ReadonlyArray<Distribution>, source: PublicationSource) =>
  Effect.gen(function* () {
    const groups = Map.groupBy(files, file => `${file.language}:${file.name}@${file.version}`);
    const states: ReadonlyArray<RegistryState> = yield* Effect.forEach(groups.values(), group =>
      REGISTRY_ADAPTERS[group[0].language].reconcileGroup(group, source)
    );
    return {
      existing: states.flatMap(state => state.existing),
      missing: states.flatMap(state => state.missing),
      tagsToRepair: states.flatMap(state => state.tagsToRepair),
    } satisfies RegistryState;
  });

class RegistryIncomplete extends Data.TaggedError('RegistryIncomplete')<{
  readonly message: string;
}> {}

const incompleteInventory = (state: RegistryState) =>
  [
    ...state.missing.map(file => `${file.name}@${file.version}/${file.file}`),
    ...state.tagsToRepair.map(tag => `${tag.name}@${tag.version} stable tag`),
  ].join(', ');

/** Polls the registries until every file and stable tag is visible; terminal conflicts stop at once. */
export const waitForRegistry = (
  files: ReadonlyArray<Distribution>,
  source: PublicationSource,
  options: { readonly attempts?: number; readonly spacing?: Duration.Input } = {}
) => {
  const attempts = options.attempts ?? 6;
  return reconcileRegistry(files, source).pipe(
    Effect.flatMap(state => {
      const incomplete = incompleteInventory(state);
      return incomplete
        ? Effect.fail(new RegistryIncomplete({ message: incomplete }))
        : Effect.succeed(state);
    }),
    Effect.retry({
      schedule: Schedule.spaced(options.spacing ?? '10 seconds'),
      times: attempts - 1,
      while: error => !isTerminal(error),
    }),
    Effect.mapError(error =>
      isTerminal(error)
        ? error
        : new RegistryIncomplete({
            message: `Registry verification incomplete after ${attempts} attempts: ${error instanceof Error ? error.message : 'Registry unavailable'}`,
          })
    )
  );
};

export const requireRecoveryWindow = (
  run: { readonly created_at: string; readonly run_attempt: number },
  now = Date.now()
) =>
  ensureTerminal(
    run.run_attempt <= MAX_PUBLISHER_ATTEMPTS &&
      now < Date.parse(run.created_at) + RECOVERY_WINDOW_MS,
    'Original recovery window exhausted; a newly approved higher-version corrective release is required'
  );

export const requireThirtyDayArtifact = (
  artifact: CandidateArtifact,
  run: { readonly created_at: string }
) =>
  ensureTerminal(
    Date.parse(artifact.expires_at) >= Date.parse(run.created_at) + RECOVERY_WINDOW_MS,
    `Actions policy cannot retain candidate ${artifact.id} for the required 30 days`
  );

/** Hashes every file a partial batch already published, as the basis of a corrective release. */
export const correctiveInventory = (
  cwd: string,
  batch: ReleaseBatch,
  sourceSha: string,
  releases: CorrectiveInput['releases'] = batch.plan.releases
) =>
  Effect.gen(function* () {
    const targets = (yield* Effect.forEach(releases, release =>
      REGISTRY_ADAPTERS[release.language].inventoryTargets(release, cwd)
    )).flat();
    const inventory = yield* Effect.forEach(targets, target =>
      Effect.gen(function* () {
        const published = yield* REGISTRY_ADAPTERS[target.language].publishedFiles(target);
        const files = yield* Effect.forEach(published, file =>
          Effect.gen(function* () {
            yield* ensure(
              servedBy(target.language, file.url),
              'Partial inventory download host differs'
            );
            const digest = yield* sha256Hex(
              yield* registryBytes(
                file.url,
                () => `Partial inventory unavailable: ${target.name}/${file.name}`
              )
            );
            yield* ensure(
              file.sha256 === undefined || digest === file.sha256,
              `Partial inventory registry hash differs: ${file.name}`
            );
            return { name: file.name, sha256: digest };
          })
        );
        return { name: target.name, version: target.version, files };
      })
    );
    return yield* Schema.decodeUnknownEffect(CorrectiveInput)({
      batchId: batch.id,
      sourceSha,
      releases,
      inventory,
    });
  });

const App = Schema.Struct({ id: Schema.Number, slug: Schema.String });
const MergedPull = Schema.Struct({
  number: Schema.Number,
  head: Schema.Struct({ sha: Sha }),
  merged_at: Schema.NullOr(Schema.String),
});

/** The publication tag must be the dedicated App's push of the merged, approved release head. */
export const verifyPublicationSource = (
  batch: ReleaseBatch,
  source: PublicationSource,
  expectedApp: { readonly id: number; readonly slug: string }
) =>
  Effect.gen(function* () {
    yield* ensure(
      source.tag === `sdk-release/${batch.id}`,
      'Publication tag differs from committed batch'
    );
    const tagRun = yield* getRun(String(source.runId));
    yield* ensure(
      tagRun.path === WORKFLOW_PATH &&
        tagRun.head_branch === source.tag &&
        tagRun.repository.full_name === SDK_RELEASE_REPOSITORY &&
        tagRun.head_sha === source.sha &&
        tagRun.event === 'push',
      'Publication requires the original protected source-tag push'
    );
    yield* requireRecoveryWindow(tagRun);
    const app = yield* request('GET', `/apps/${encodeURIComponent(expectedApp.slug)}`, App);
    yield* ensure(
      app.id === expectedApp.id &&
        app.slug === expectedApp.slug &&
        tagRun.actor?.type === 'Bot' &&
        tagRun.actor.login === `${app.slug}[bot]`,
      'Publication source tag was not pushed by the dedicated SDK release App'
    );
    const tag = yield* request(
      'GET',
      `${REPOSITORY_PATH}/git/ref/tags/${source.tag}`,
      Schema.Struct({ object: Schema.Struct({ type: Schema.String, sha: Sha }) })
    );
    yield* ensure(
      tag.object.type === 'commit' && tag.object.sha === source.sha,
      'Publication tag source changed'
    );
    const pulls = yield* request(
      'GET',
      `${REPOSITORY_PATH}/commits/${source.sha}/pulls?per_page=100`,
      Schema.Array(MergedPull)
    );
    const release = pulls.filter(pull => pull.head.sha === source.sha && pull.merged_at !== null);
    yield* ensure(release.length === 1, 'Publication source has no unique merged release PR');
    const verified = yield* verifyReleaseHead(release[0].number);
    yield* ensure(
      verified.pull.merged === true &&
        verified.pull.head.sha === source.sha &&
        JSON.stringify(verified.batch) === JSON.stringify(batch),
      'Publication source differs from the merged approved release'
    );
    return verified.pull;
  });

const Environment = Schema.Struct({
  protection_rules: Schema.Array(Schema.Struct({ type: Schema.String })),
  deployment_branch_policy: Schema.NullOr(
    Schema.Struct({ protected_branches: Schema.Boolean, custom_branch_policies: Schema.Boolean })
  ),
});
const DeploymentPolicies = Schema.Struct({
  total_count: Schema.Number,
  branch_policies: Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String })),
});
const RulesetDetails = Schema.Struct({
  conditions: Schema.Struct({
    ref_name: Schema.Struct({
      include: Schema.Array(Schema.String),
      exclude: Schema.Array(Schema.String),
    }),
  }),
  bypass_actors: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        actor_id: Schema.NullOr(Schema.Number),
        actor_type: Schema.String,
        bypass_mode: Schema.String,
      })
    )
  ),
  rules: Schema.Array(Schema.Struct({ type: Schema.String })),
});
const RELEASE_TAG_PATTERN = 'sdk-release/*';
const PROTECTED_TAG_OPERATIONS = ['creation', 'update', 'deletion'];

/** A registry environment deploys only from `sdk-release/*` tags, with no reviewers or wait rules. */
const verifyEnvironment = (language: Language) =>
  Effect.gen(function* () {
    const name = REGISTRY_LANES[language].environment;
    const environment = yield* request(
      'GET',
      `${REPOSITORY_PATH}/environments/${name}`,
      Environment
    );
    const policy = environment.deployment_branch_policy;
    yield* ensure(
      environment.protection_rules.every(rule => rule.type === 'branch_policy') &&
        policy !== null &&
        !policy.protected_branches &&
        policy.custom_branch_policies,
      `${name} must have no reviewers or wait rules, with custom tag-only deployment policies`
    );
    const rules = yield* request(
      'GET',
      `${REPOSITORY_PATH}/environments/${name}/deployment-branch-policies?per_page=100`,
      DeploymentPolicies
    );
    const [only] = rules.branch_policies;
    yield* ensure(
      rules.total_count === 1 &&
        rules.branch_policies.length === 1 &&
        only.name === RELEASE_TAG_PATTERN &&
        only.type === 'tag',
      `${name} must allow only Tag sdk-release/*; branches and other tags are forbidden`
    );
  });

/** Without listed bypass actors only the publisher can vouch for it; the controller needs the App as sole bypass. */
const protectsReleaseTags = (
  details: typeof RulesetDetails.Type,
  appId: number,
  controller: boolean
) =>
  details.conditions.ref_name.include.includes(`refs/tags/${RELEASE_TAG_PATTERN}`) &&
  details.conditions.ref_name.exclude.length === 0 &&
  PROTECTED_TAG_OPERATIONS.every(type => details.rules.some(rule => rule.type === type)) &&
  (details.bypass_actors === undefined
    ? !controller
    : details.bypass_actors.length === 1 &&
      details.bypass_actors[0].actor_type === 'Integration' &&
      details.bypass_actors[0].actor_id === appId &&
      details.bypass_actors[0].bypass_mode === 'always');

export const verifyPublicationPolicy = (
  languages: ReadonlySet<Language>,
  appId: number,
  controller = false
) =>
  Effect.gen(function* () {
    yield* Effect.forEach(languages, verifyEnvironment, { discard: true });
    const rulesets = yield* request(
      'GET',
      `${REPOSITORY_PATH}/rulesets?includes_parents=true&per_page=100`,
      Schema.Array(
        Schema.Struct({ id: Schema.Number, target: Schema.String, enforcement: Schema.String })
      ).check(Schema.isMaxLength(99))
    );
    const details = yield* Effect.forEach(
      rulesets.filter(rule => rule.target === 'tag' && rule.enforcement === 'active'),
      rule => request('GET', `${REPOSITORY_PATH}/rulesets/${rule.id}`, RulesetDetails)
    );
    yield* ensure(
      details.some(ruleset => protectsReleaseTags(ruleset, appId, controller)),
      'sdk-release/* requires an active tag ruleset restricting creation, update and deletion to the dedicated release App'
    );
  });

const batchLanguages = (batch: ReleaseBatch) =>
  new Set(batch.plan.releases.map(release => release.language));

/** Reads and checks an already downloaded original candidate directory. */
const readCandidateDirectory = (directory: string, source: PublicationSource, language: Language) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifest = yield* readJson(CandidateManifest, path.join(directory, CANDIDATE_MANIFEST));
    yield* ensureTerminal(
      manifest.sourceSha === source.sha &&
        manifest.producerRun === source.runId &&
        manifest.language === language,
      'Original candidate producer/source conflict'
    );
    yield* ensure(
      manifest.approvedFrom !== undefined,
      'Publication candidate was not copied from the approved release PR'
    );
    const names = (yield* fs.readDirectory(directory)).filter(name => name !== CANDIDATE_MANIFEST);
    const bytes = new Map(
      yield* Effect.forEach(names, name =>
        Effect.map(fs.readFile(path.join(directory, name)), contents => [name, contents] as const)
      )
    );
    yield* verifyCandidateFiles(bytes, manifest.files);
    return { manifest, bytes };
  });

/** Resolves every selected language's original files before either registry receives bytes. */
export const loadOriginalDistributions = (
  cwd: string,
  batch: ReleaseBatch,
  source: PublicationSource
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const artifacts = yield* originalCandidates(source.runId);
    const tagRun = yield* getRun(String(source.runId));
    const files: Distribution[] = [];
    const identities: CandidateArtifact[] = [];
    for (const language of batchLanguages(batch)) {
      const reused = yield* reuseCandidate(
        artifacts,
        candidateArtifactName(language),
        source.runId,
        source.sha
      );
      if (Option.isNone(reused))
        return yield* terminal(
          `Original ${language} candidate deleted; corrective release required`
        );
      const artifact = reused.value;
      yield* requireThirtyDayArtifact(artifact, tagRun);
      identities.push(artifact);
      const directory = path.resolve(cwd, 'sdk-publication', language);
      yield* fs.remove(directory, { recursive: true, force: true });
      yield* downloadCandidate(artifact, directory);
      const { manifest, bytes } = yield* readCandidateDirectory(directory, source, language);
      files.push(
        ...(yield* REGISTRY_ADAPTERS[language].candidateDistributions({
          cwd,
          batch,
          directory,
          manifest,
          bytes,
        }))
      );
    }
    return { files, identities };
  });

const appendTo = (target: Option.Option<string>, text: string) =>
  Option.match(target, {
    onNone: () => Effect.void,
    onSome: file =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(file, text, { flag: 'a' });
      }),
  });

const ActionsFiles = Config.all({
  output: Config.option(Config.String('GITHUB_OUTPUT')),
  summary: Config.option(Config.String('GITHUB_STEP_SUMMARY')),
});
type ActionsFiles = Config.Success<typeof ActionsFiles>;

const reportCandidates = (
  actions: ActionsFiles,
  identities: ReadonlyArray<CandidateArtifact>,
  files: ReadonlyArray<Distribution>,
  source: PublicationSource
) =>
  Effect.gen(function* () {
    const lines = [
      `Original producer: https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${source.runId}`,
      `Source: ${source.sha}`,
      identities
        .map(
          artifact =>
            `- Artifact ${artifact.id}: ${artifact.digest}; expires ${artifact.expires_at}`
        )
        .join('\n'),
      files
        .map(
          file =>
            `- ${file.name}@${file.version}/${file.file}: sha256:${file.sha256} (${file.bytes.length} bytes)`
        )
        .join('\n'),
    ];
    yield* appendTo(actions.summary, `${lines.join('\n')}\n`);
    yield* appendTo(
      actions.output,
      `candidate-ids=${JSON.stringify(identities.map(artifact => artifact.id))}\n`
    );
  });

interface PublicationContext {
  readonly cwd: string;
  readonly batch: ReleaseBatch;
  readonly source: PublicationSource;
  readonly files: ReadonlyArray<Distribution>;
  readonly state: RegistryState;
  readonly actions: ActionsFiles;
}

const filesOf = (files: ReadonlyArray<Distribution>, language: Language) =>
  files.filter(file => file.language === language);

/** Stages only the missing original Python files for the trusted-publisher upload step. */
const stageMissingPython = (context: PublicationContext) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = path.resolve(context.cwd, 'sdk-publication/missing-python');
    yield* fs.remove(directory, { recursive: true, force: true });
    yield* fs.makeDirectory(directory, { recursive: true });
    const missing = filesOf(context.state.missing, 'python');
    yield* Effect.forEach(
      missing,
      file => fs.writeFile(path.join(directory, file.file), file.bytes),
      {
        discard: true,
      }
    );
    yield* appendTo(context.actions.output, `missing=${missing.length > 0}\n`);
  });

/** Publishes under a batch-only dist-tag, then moves `latest` forward once the upload is visible. */
const uploadMissingNpm = (context: PublicationContext) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const npm = (args: ReadonlyArray<string>) =>
      run('npm', args, { cwd: context.cwd, env: withoutReleaseTokens });
    for (const file of filesOf(context.state.missing, 'typescript'))
      yield* npm([
        'publish',
        path.resolve(context.cwd, 'sdk-publication/typescript', file.file),
        '--ignore-scripts',
        '--provenance',
        '--access=public',
        `--tag=sdk-release-${context.batch.id}`,
      ]);
    for (const file of filesOf(context.files, 'typescript')) {
      const current = yield* reconcileRegistry([file], context.source);
      yield* ensure(
        current.missing.length === 0,
        `npm upload not yet visible: ${file.name}@${file.version}`
      );
      if (current.tagsToRepair.length)
        yield* npm(['dist-tag', 'add', `${file.name}@${file.version}`, 'latest']);
    }
  });

const PUBLICATION_MODES = {
  preflight: { reconcile: reconcileRegistry, finish: (_: PublicationContext) => Effect.void },
  'prepare-npm': { reconcile: reconcileRegistry, finish: (_: PublicationContext) => Effect.void },
  'prepare-pypi': { reconcile: reconcileRegistry, finish: stageMissingPython },
  'upload-npm': { reconcile: reconcileRegistry, finish: uploadMissingNpm },
  verify: {
    reconcile: (files: ReadonlyArray<Distribution>, source: PublicationSource) =>
      waitForRegistry(files, source),
    finish: (context: PublicationContext) =>
      appendTo(
        context.actions.summary,
        'Every selected registry file, npm stable tag and native provenance source is verified. Fresh public consumer verification follows.\n'
      ),
  },
} as const;
type PublicationMode = keyof typeof PUBLICATION_MODES;

const PublicationEnvironment = Config.all({
  token: Config.schema(Schema.NonEmptyString, 'SDK_READ_TOKEN'),
  runId: Config.schema(PositiveIntFromString, 'GITHUB_RUN_ID'),
  sha: Config.schema(Sha, 'GITHUB_SHA'),
  ref: Config.String('GITHUB_REF'),
  event: Config.schema(Schema.Literal('push'), 'GITHUB_EVENT_NAME'),
  appId: Config.schema(PositiveIntFromString, 'SDK_RELEASE_APP_ID'),
  appSlug: Config.schema(
    Schema.String.check(Schema.isPattern(/^[a-z0-9-]+$/)),
    'SDK_RELEASE_APP_SLUG'
  ),
  controllerToken: Config.option(Config.String('SDK_RELEASE_TOKEN')),
});

const publish = (mode: PublicationMode) =>
  Effect.gen(function* () {
    const env = yield* PublicationEnvironment;
    const actions = yield* ActionsFiles;
    yield* ensure(
      env.ref.startsWith('refs/tags/sdk-release/'),
      'Registry jobs require the protected source-tag event'
    );
    yield* ensure(
      Option.isNone(Option.filter(env.controllerToken, token => token !== '')),
      'Registry jobs must not receive the controller credential'
    );
    const cwd = (yield* Path.Path).resolve('.');
    const source = { sha: env.sha, tag: env.ref.slice('refs/tags/'.length), runId: env.runId };
    const batch = yield* readJson(ReleaseBatch, BATCH_PATH);
    const { reconcile, finish } = PUBLICATION_MODES[mode];
    yield* Effect.gen(function* () {
      yield* verifyPublicationSource(batch, source, { id: env.appId, slug: env.appSlug });
      yield* verifyPublicationPolicy(batchLanguages(batch), env.appId);
      const { files, identities } = yield* loadOriginalDistributions(cwd, batch, source);
      yield* reportCandidates(actions, identities, files, source);
      const state = yield* reconcile(files, source);
      yield* finish({ cwd, batch, source, files, state, actions });
    }).pipe(
      Effect.tapError(error =>
        isTerminal(error) ? appendTo(actions.output, 'terminal=true\n') : Effect.void
      ),
      Effect.provide(GitHub.layer(env.token))
    );
  });

/** Owner preflight: the policy token checks tag restrictions and tag-only registry environments. */
const checkPolicy = Effect.gen(function* () {
  const owner = yield* Config.all({
    token: Config.schema(Schema.NonEmptyString, 'SDK_POLICY_TOKEN'),
    appId: Config.schema(PositiveIntFromString, 'SDK_RELEASE_APP_ID'),
  });
  yield* verifyPublicationPolicy(new Set(['typescript', 'python']), owner.appId, true).pipe(
    Effect.provide(GitHub.layer(owner.token))
  );
  yield* Console.log(
    'Owner preflight verified dedicated-App tag restrictions and tag-only registry environments. Registry trusted-publisher registrations and negative writer/legacy-App checks remain hosted acceptance requirements.'
  );
});

const Mode = Schema.Literals([
  'check-policy',
  'preflight',
  'prepare-npm',
  'prepare-pypi',
  'upload-npm',
  'verify',
]);

const main = Effect.gen(function* () {
  const [argument] = yield* (yield* Stdio.Stdio).args;
  const mode = yield* Schema.decodeUnknownEffect(Mode)(argument);
  yield* mode === 'check-policy' ? checkPolicy : publish(mode);
});

if (import.meta.main) runMain(main);
