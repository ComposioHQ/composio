import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import semver from 'semver';
import { z } from 'zod';
import {
  candidateManifestSchema,
  originalCandidates,
  reuseCandidate,
  sha256,
  verifyCandidateFiles,
  type CandidateArtifact,
} from './artifacts';
import { verifyReleaseHead } from './batch';
import { GitHubReleaseClient, SDK_RELEASE_REPOSITORY, type ReleaseFetch } from './github';
import { discoverPythonPackages } from './python-metadata';
import { correctiveInputSchema, type CorrectiveInput } from './plan';
import { runPreparationCommand } from './commands';
import { batchPath, releaseBatchSchema, sourceShaSchema, type ReleaseBatch } from './source';

export interface PublicationSource {
  sha: string;
  tag: string;
  runId: number;
}
export interface Distribution {
  language: 'typescript' | 'python';
  name: string;
  version: string;
  file: string;
  bytes: Uint8Array;
  sha256: string;
}
export class TerminalPublicationError extends Error {}
const repo = `/repos/${SDK_RELEASE_REPOSITORY}`;
const npmHost = 'https://registry.npmjs.org';
const pythonHost = 'https://pypi.org';

async function json(url: string, fetcher: ReleaseFetch): Promise<unknown | undefined> {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Registry lookup incomplete: ${url} (${response.status})`);
  return response.json();
}
async function originalBytes(url: string, file: Distribution, fetcher: ReleaseFetch) {
  const parsed = new URL(url);
  const allowed =
    file.language === 'typescript'
      ? parsed.hostname === 'registry.npmjs.org'
      : parsed.hostname === 'files.pythonhosted.org';
  if (parsed.protocol !== 'https:' || !allowed)
    throw new TerminalPublicationError(`Unexpected registry download host: ${file.file}`);
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok)
    throw new Error(`Registry download incomplete: ${file.file} (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== file.bytes.length || sha256(bytes) !== file.sha256)
    throw new TerminalPublicationError(
      `Registry content conflict: ${file.name}@${file.version}/${file.file}. A newly approved higher-version corrective release is required.`
    );
}

/** Source/subject inspection supplements native npm audit signatures; decoding alone does not verify a signature. */
export function verifyNpmProvenance(value: unknown, file: Distribution, source: PublicationSource) {
  const attestations = z
    .object({
      attestations: z.array(
        z.object({
          predicateType: z.string(),
          bundle: z.object({ dsseEnvelope: z.object({ payload: z.string() }) }),
        })
      ),
    })
    .parse(value);
  const entry = attestations.attestations.find(
    entry => entry.predicateType === 'https://slsa.dev/provenance/v1'
  );
  if (!entry) throw new Error(`Native npm provenance incomplete: ${file.name}@${file.version}`);
  const statement = z
    .object({
      subject: z.array(z.object({ name: z.string(), digest: z.object({ sha512: z.string() }) })),
      predicate: z.object({
        buildDefinition: z.object({
          externalParameters: z.object({
            workflow: z.object({ repository: z.string(), path: z.string(), ref: z.string() }),
          }),
          resolvedDependencies: z.array(
            z.object({ uri: z.string(), digest: z.object({ gitCommit: z.string() }) })
          ),
        }),
        runDetails: z.object({ metadata: z.object({ invocationId: z.string() }) }),
      }),
    })
    .parse(JSON.parse(Buffer.from(entry.bundle.dsseEnvelope.payload, 'base64').toString('utf8')));
  const workflow = statement.predicate.buildDefinition.externalParameters.workflow;
  const subject = `pkg:npm/${file.name.replace('@', '%40')}@${file.version}`;
  if (
    !statement.subject.some(
      item =>
        item.name === subject &&
        item.digest.sha512 === createHash('sha512').update(file.bytes).digest('hex')
    )
  )
    throw new TerminalPublicationError(`Native npm provenance subject conflict: ${file.name}`);
  if (
    workflow.repository !== `https://github.com/${SDK_RELEASE_REPOSITORY}` ||
    workflow.path !== '.github/workflows/sdk.release.yml' ||
    workflow.ref !== `refs/tags/${source.tag}` ||
    !statement.predicate.buildDefinition.resolvedDependencies.some(
      item =>
        item.uri === `git+https://github.com/${SDK_RELEASE_REPOSITORY}@refs/tags/${source.tag}` &&
        item.digest.gitCommit === source.sha
    ) ||
    !statement.predicate.runDetails.metadata.invocationId.startsWith(
      `https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${source.runId}/attempts/`
    )
  )
    throw new TerminalPublicationError(`Native npm provenance source conflict: ${file.name}`);
}

export async function reconcileRegistry(
  files: Distribution[],
  source: PublicationSource,
  fetcher: ReleaseFetch = fetch
) {
  const existing: Distribution[] = [],
    missing: Distribution[] = [];
  const tagsToRepair: { name: string; version: string }[] = [];
  const groups = Map.groupBy(files, file => `${file.language}:${file.name}@${file.version}`);
  for (const group of groups.values()) {
    const first = group[0];
    if (first.language === 'python') {
      const value = await json(
        `${pythonHost}/pypi/${encodeURIComponent(first.name)}/${first.version}/json`,
        fetcher
      );
      const urls =
        value === undefined
          ? []
          : z
              .object({
                urls: z.array(
                  z.object({
                    filename: z.string(),
                    url: z.url(),
                    digests: z.object({ sha256: z.string() }),
                  })
                ),
              })
              .parse(value).urls;
      if (
        new Set(urls.map(file => file.filename)).size !== urls.length ||
        urls.some(file => !group.some(candidate => candidate.file === file.filename))
      )
        throw new TerminalPublicationError(
          `Unreviewed PyPI file for ${first.name}@${first.version}; corrective release required`
        );
      for (const file of group) {
        const published = urls.find(item => item.filename === file.file);
        if (!published) {
          missing.push(file);
          continue;
        }
        if (published.digests.sha256 !== file.sha256)
          throw new TerminalPublicationError(`Registry content conflict: ${file.file}`);
        await originalBytes(published.url, file, fetcher);
        existing.push(file);
      }
    } else {
      if (group.length !== 1)
        throw new TerminalPublicationError('Expected exactly one npm tarball per package');
      const value = await json(
        `${npmHost}/${encodeURIComponent(first.name)}/${first.version}`,
        fetcher
      );
      if (value === undefined) missing.push(first);
      else {
        const metadata = z
          .object({
            name: z.string(),
            version: z.string(),
            dist: z.object({
              tarball: z.url(),
              attestations: z.object({ url: z.url() }).optional(),
            }),
          })
          .parse(value);
        if (metadata.name !== first.name || metadata.version !== first.version)
          throw new TerminalPublicationError('Registry npm identity conflict');
        await originalBytes(metadata.dist.tarball, first, fetcher);
        if (
          !metadata.dist.attestations ||
          new URL(metadata.dist.attestations.url).origin !== npmHost
        )
          throw new Error(`Native npm provenance incomplete: ${first.name}@${first.version}`);
        verifyNpmProvenance(await json(metadata.dist.attestations.url, fetcher), first, source);
        existing.push(first);
      }
      const latest = await json(`${npmHost}/${encodeURIComponent(first.name)}/latest`, fetcher);
      const version =
        latest === undefined ? undefined : z.object({ version: z.string() }).parse(latest).version;
      if (version && !semver.valid(version))
        throw new Error(`Invalid stable npm tag: ${first.name}`);
      if (!version || semver.lt(version, first.version))
        tagsToRepair.push({ name: first.name, version: first.version });
    }
  }
  return { existing, missing, tagsToRepair };
}

export async function waitForRegistry(
  files: Distribution[],
  source: PublicationSource,
  fetcher: ReleaseFetch = fetch,
  options: { attempts?: number; pause?: () => Promise<void> } = {}
) {
  const attempts = options.attempts ?? 6;
  let incomplete = 'Registry lookup has not completed';
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const state = await reconcileRegistry(files, source, fetcher);
      incomplete = [
        ...state.missing.map(file => `${file.name}@${file.version}/${file.file}`),
        ...state.tagsToRepair.map(tag => `${tag.name}@${tag.version} stable tag`),
      ].join(', ');
      if (!incomplete) return state;
    } catch (error) {
      if (error instanceof TerminalPublicationError) throw error;
      incomplete = error instanceof Error ? error.message : 'Registry unavailable';
    }
    if (attempt + 1 < attempts) await (options.pause ?? (() => Bun.sleep(10_000)))();
  }
  throw new Error(`Registry verification incomplete after ${attempts} attempts: ${incomplete}`);
}

export function requireRecoveryWindow(
  run: { created_at: string; run_attempt: number },
  now = Date.now()
) {
  if (run.run_attempt > 50 || now >= Date.parse(run.created_at) + 30 * 86_400_000)
    throw new TerminalPublicationError(
      'Original recovery window exhausted; a newly approved higher-version corrective release is required'
    );
}
export function requireThirtyDayArtifact(artifact: CandidateArtifact, run: { created_at: string }) {
  if (Date.parse(artifact.expires_at) < Date.parse(run.created_at) + 30 * 86_400_000)
    throw new TerminalPublicationError(
      `Actions policy cannot retain candidate ${artifact.id} for the required 30 days`
    );
}

export async function correctiveInventory(
  cwd: string,
  batch: ReleaseBatch,
  sourceSha: string,
  releases: CorrectiveInput['releases'] = batch.plan.releases,
  fetcher: ReleaseFetch = fetch
): Promise<CorrectiveInput> {
  const targets: { name: string; version: string; language: 'typescript' | 'python' }[] = [];
  for (const release of releases) {
    if (release.language === 'python')
      targets.push(
        ...(await discoverPythonPackages(cwd)).map(pkg => ({
          name: pkg.name,
          version: release.newVersion,
          language: 'python' as const,
        }))
      );
    else
      targets.push({ name: release.name, version: release.newVersion, language: release.language });
  }
  const inventory = [];
  for (const target of targets) {
    const value = await json(
      target.language === 'python'
        ? `${pythonHost}/pypi/${target.name}/${target.version}/json`
        : `${npmHost}/${encodeURIComponent(target.name)}/${target.version}`,
      fetcher
    );
    const files: { name: string; sha256: string }[] = [];
    if (value !== undefined) {
      const published =
        target.language === 'python'
          ? z
              .object({
                urls: z.array(
                  z.object({
                    filename: z.string(),
                    url: z.url(),
                    digests: z.object({ sha256: z.string() }),
                  })
                ),
              })
              .parse(value)
              .urls.map(file => ({
                name: file.filename,
                url: file.url,
                digest: file.digests.sha256,
              }))
          : [
              {
                name: `${target.name.replace(/^@/, '').replaceAll('/', '-')}-${target.version}.tgz`,
                url: z.object({ dist: z.object({ tarball: z.url() }) }).parse(value).dist.tarball,
              },
            ];
      for (const file of published) {
        const host = new URL(file.url);
        if (
          host.protocol !== 'https:' ||
          host.hostname !==
            (target.language === 'python' ? 'files.pythonhosted.org' : 'registry.npmjs.org')
        )
          throw new Error('Partial inventory download host differs');
        const response = await fetcher(file.url, {
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok)
          throw new Error(`Partial inventory unavailable: ${target.name}/${file.name}`);
        const digest = sha256(new Uint8Array(await response.arrayBuffer()));
        if ('digest' in file && digest !== file.digest)
          throw new Error(`Partial inventory registry hash differs: ${file.name}`);
        files.push({ name: file.name, sha256: digest });
      }
    }
    inventory.push({ name: target.name, version: target.version, files });
  }
  return correctiveInputSchema.parse({ batchId: batch.id, sourceSha, releases, inventory });
}

export async function verifyPublicationSource(
  github: GitHubReleaseClient,
  batch: ReleaseBatch,
  source: PublicationSource,
  expectedApp: { id: number; slug: string }
) {
  if (source.tag !== `sdk-release/${batch.id}`)
    throw new Error('Publication tag differs from committed batch');
  const run = await github.getRun(String(source.runId));
  if (
    run.path !== '.github/workflows/sdk.release.yml' ||
    run.head_branch !== source.tag ||
    run.repository.full_name !== SDK_RELEASE_REPOSITORY ||
    run.head_sha !== source.sha ||
    run.event !== 'push'
  )
    throw new Error('Publication requires the original protected source-tag push');
  requireRecoveryWindow(run);
  const app = await github.request(
    'GET',
    `/apps/${encodeURIComponent(expectedApp.slug)}`,
    z.object({ id: z.number(), slug: z.string() })
  );
  if (
    app.id !== expectedApp.id ||
    app.slug !== expectedApp.slug ||
    run.actor?.type !== 'Bot' ||
    run.actor.login !== `${app.slug}[bot]`
  )
    throw new Error('Publication source tag was not pushed by the dedicated SDK release App');
  const tag = await github.request(
    'GET',
    `${repo}/git/ref/tags/${source.tag}`,
    z.object({ object: z.object({ type: z.string(), sha: sourceShaSchema }) })
  );
  if (tag.object.type !== 'commit' || tag.object.sha !== source.sha)
    throw new Error('Publication tag source changed');
  const pulls = await github.request(
    'GET',
    `${repo}/commits/${source.sha}/pulls?per_page=100`,
    z.array(
      z.object({
        number: z.number(),
        head: z.object({ sha: sourceShaSchema }),
        merged_at: z.string().nullable(),
      })
    )
  );
  const release = pulls.filter(pull => pull.head.sha === source.sha && pull.merged_at !== null);
  if (release.length !== 1) throw new Error('Publication source has no unique merged release PR');
  const verified = await verifyReleaseHead(github, release[0].number);
  if (
    !verified.pull.merged ||
    verified.pull.head.sha !== source.sha ||
    JSON.stringify(verified.batch) !== JSON.stringify(batch)
  )
    throw new Error('Publication source differs from the merged approved release');
  return verified.pull;
}

export async function verifyPublicationPolicy(
  github: GitHubReleaseClient,
  languages: Set<string>,
  appId: number,
  controller = false
) {
  for (const language of languages) {
    const name = language === 'typescript' ? 'npm-release' : 'pypi-release';
    const environment = await github.request(
      'GET',
      `${repo}/environments/${name}`,
      z.object({
        protection_rules: z.array(z.object({ type: z.string() })),
        deployment_branch_policy: z
          .object({ protected_branches: z.boolean(), custom_branch_policies: z.boolean() })
          .nullable(),
      })
    );
    const policy = environment.deployment_branch_policy;
    if (
      environment.protection_rules.some(rule => rule.type !== 'branch_policy') ||
      !policy ||
      policy.protected_branches ||
      !policy.custom_branch_policies
    )
      throw new Error(
        `${name} must have no reviewers or wait rules, with custom tag-only deployment policies`
      );
    const rules = await github.request(
      'GET',
      `${repo}/environments/${name}/deployment-branch-policies?per_page=100`,
      z.object({
        total_count: z.number(),
        branch_policies: z.array(z.object({ name: z.string(), type: z.string() })),
      })
    );
    if (
      rules.total_count !== 1 ||
      rules.branch_policies.length !== 1 ||
      rules.branch_policies[0].name !== 'sdk-release/*' ||
      rules.branch_policies[0].type !== 'tag'
    )
      throw new Error(
        `${name} must allow only Tag sdk-release/*; branches and other tags are forbidden`
      );
  }
  const rulesets = await github.request(
    'GET',
    `${repo}/rulesets?includes_parents=true&per_page=100`,
    z.array(z.object({ id: z.number(), target: z.string(), enforcement: z.string() })).max(99)
  );
  let protectedTag = false;
  for (const rule of rulesets.filter(
    rule => rule.target === 'tag' && rule.enforcement === 'active'
  )) {
    const details = await github.request(
      'GET',
      `${repo}/rulesets/${rule.id}`,
      z.object({
        conditions: z.object({
          ref_name: z.object({ include: z.array(z.string()), exclude: z.array(z.string()) }),
        }),
        bypass_actors: z
          .array(
            z.object({
              actor_id: z.number().nullable(),
              actor_type: z.string(),
              bypass_mode: z.string(),
            })
          )
          .optional(),
        rules: z.array(z.object({ type: z.string() })),
      })
    );
    if (
      !details.conditions.ref_name.include.includes('refs/tags/sdk-release/*') ||
      details.conditions.ref_name.exclude.length
    )
      continue;
    protectedTag ||=
      ['creation', 'update', 'deletion'].every(type =>
        details.rules.some(rule => rule.type === type)
      ) &&
      (details.bypass_actors === undefined
        ? !controller
        : details.bypass_actors.length === 1 &&
          details.bypass_actors[0].actor_type === 'Integration' &&
          details.bypass_actors[0].actor_id === appId &&
          details.bypass_actors[0].bypass_mode === 'always');
  }
  if (!protectedTag)
    throw new Error(
      'sdk-release/* requires an active tag ruleset restricting creation, update and deletion to the dedicated release App'
    );
}

/** All selected languages are resolved before either registry receives any bytes. */
export async function loadOriginalDistributions(
  github: GitHubReleaseClient,
  cwd: string,
  batch: ReleaseBatch,
  source: PublicationSource
) {
  const artifacts = await originalCandidates(github, source.runId);
  const run = await github.getRun(String(source.runId));
  const files: Distribution[] = [],
    identities: CandidateArtifact[] = [];
  for (const language of new Set(batch.plan.releases.map(release => release.language))) {
    const artifact = reuseCandidate(
      artifacts,
      `sdk-candidate-${language}`,
      source.runId,
      source.sha
    );
    if (!artifact)
      throw new TerminalPublicationError(
        `Original ${language} candidate deleted; corrective release required`
      );
    requireThirtyDayArtifact(artifact, run);
    identities.push(artifact);
    const directory = resolve(cwd, 'sdk-publication', language);
    await rm(directory, { recursive: true, force: true });
    await github.downloadArtifact(artifact, directory);
    const manifest = candidateManifestSchema.parse(
      await Bun.file(join(directory, 'candidate.json')).json()
    );
    if (
      manifest.sourceSha !== source.sha ||
      manifest.producerRun !== source.runId ||
      manifest.language !== language
    )
      throw new TerminalPublicationError('Original candidate producer/source conflict');
    const actual = new Map(
      await Promise.all(
        (await readdir(directory))
          .filter(name => name !== 'candidate.json')
          .map(async name => [name, new Uint8Array(await readFile(join(directory, name)))] as const)
      )
    );
    verifyCandidateFiles(actual, manifest.files);
    if (language === 'typescript') {
      for (const entry of manifest.files) {
        const metadata = z
          .object({ name: z.string(), version: z.string() })
          .parse(
            JSON.parse(
              runPreparationCommand(
                'tar',
                ['-xOf', join(directory, entry.name), 'package/package.json'],
                cwd
              )
            )
          );
        if (
          !batch.plan.releases.some(
            release =>
              release.language === language &&
              release.name === metadata.name &&
              release.newVersion === metadata.version
          )
        )
          throw new TerminalPublicationError('Candidate contains an unplanned npm package');
        files.push({
          language,
          name: metadata.name,
          version: metadata.version,
          file: entry.name,
          bytes: actual.get(entry.name)!,
          sha256: entry.sha256,
        });
      }
      if (
        manifest.files.length !==
        batch.plan.releases.filter(release => release.language === language).length
      )
        throw new TerminalPublicationError('Candidate npm package inventory differs');
    } else {
      const version = batch.plan.releases.find(
        release => release.language === 'python'
      )!.newVersion;
      for (const pkg of await discoverPythonPackages(cwd)) {
        const prefix = `${pkg.name.replaceAll('-', '_')}-${version}`;
        const expected = [`${prefix}-py3-none-any.whl`, `${prefix}.tar.gz`];
        for (const name of expected) {
          const entry = manifest.files.find(file => file.name === name);
          if (!entry)
            throw new TerminalPublicationError(`Original Python distribution missing: ${name}`);
          files.push({
            language,
            name: pkg.name,
            version,
            file: name,
            bytes: actual.get(name)!,
            sha256: entry.sha256,
          });
        }
      }
      if (manifest.files.length !== files.filter(file => file.language === 'python').length)
        throw new TerminalPublicationError('Candidate Python file inventory differs');
    }
  }
  return { files, identities };
}

async function reportCandidates(
  identities: CandidateArtifact[],
  files: Distribution[],
  source: PublicationSource
) {
  const text =
    `Original producer: https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${source.runId}\nSource: ${source.sha}\n` +
    identities
      .map(
        artifact => `- Artifact ${artifact.id}: ${artifact.digest}; expires ${artifact.expires_at}`
      )
      .join('\n') +
    '\n' +
    files
      .map(
        file =>
          `- ${file.name}@${file.version}/${file.file}: sha256:${file.sha256} (${file.bytes.length} bytes)`
      )
      .join('\n') +
    '\n';
  if (process.env.GITHUB_STEP_SUMMARY)
    await writeFile(process.env.GITHUB_STEP_SUMMARY, text, { flag: 'a' });
  if (process.env.GITHUB_OUTPUT)
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `candidate-ids=${JSON.stringify(identities.map(artifact => artifact.id))}\n`,
      { flag: 'a' }
    );
}

if (import.meta.main) {
  if (Bun.argv[2] === 'check-policy') {
    const owner = z
      .object({
        SDK_POLICY_TOKEN: z.string().min(1),
        SDK_RELEASE_APP_ID: z.coerce.number().int().positive(),
      })
      .parse(process.env);
    await verifyPublicationPolicy(
      new GitHubReleaseClient(owner.SDK_POLICY_TOKEN),
      new Set(['typescript', 'python']),
      owner.SDK_RELEASE_APP_ID,
      true
    );
    console.log(
      'Owner preflight verified dedicated-App tag restrictions and tag-only registry environments. Registry trusted-publisher registrations and negative writer/legacy-App checks remain hosted acceptance requirements.'
    );
    process.exit(0);
  }
  const mode = z
    .enum(['preflight', 'prepare-npm', 'prepare-pypi', 'upload-npm', 'verify'])
    .parse(Bun.argv[2]);
  const env = z
    .object({
      SDK_READ_TOKEN: z.string().min(1),
      GITHUB_RUN_ID: z.coerce.number().int().positive(),
      GITHUB_SHA: sourceShaSchema,
      GITHUB_REF: z.string(),
      GITHUB_EVENT_NAME: z.literal('push'),
      SDK_RELEASE_APP_ID: z.coerce.number().int().positive(),
      SDK_RELEASE_APP_SLUG: z.string().regex(/^[a-z0-9-]+$/),
    })
    .parse(process.env);
  if (!env.GITHUB_REF.startsWith('refs/tags/sdk-release/'))
    throw new Error('Registry jobs require the protected source-tag event');
  if (process.env.SDK_RELEASE_TOKEN)
    throw new Error('Registry jobs must not receive the controller credential');
  const source = {
    sha: env.GITHUB_SHA,
    tag: env.GITHUB_REF.slice('refs/tags/'.length),
    runId: env.GITHUB_RUN_ID,
  };
  const batch = releaseBatchSchema.parse(await Bun.file(batchPath).json());
  const github = new GitHubReleaseClient(env.SDK_READ_TOKEN);
  try {
    await verifyPublicationSource(github, batch, source, {
      id: env.SDK_RELEASE_APP_ID,
      slug: env.SDK_RELEASE_APP_SLUG,
    });
    await verifyPublicationPolicy(
      github,
      new Set(batch.plan.releases.map(release => release.language)),
      env.SDK_RELEASE_APP_ID
    );
    const { files, identities } = await loadOriginalDistributions(
      github,
      process.cwd(),
      batch,
      source
    );
    await reportCandidates(identities, files, source);
    const state =
      mode === 'verify'
        ? await waitForRegistry(files, source)
        : await reconcileRegistry(files, source);
    if (mode === 'prepare-pypi') {
      const directory = resolve('sdk-publication/missing-python');
      await rm(directory, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
      const missing = state.missing.filter(file => file.language === 'python');
      for (const file of missing) await writeFile(join(directory, file.file), file.bytes);
      if (process.env.GITHUB_OUTPUT)
        await writeFile(process.env.GITHUB_OUTPUT, `missing=${missing.length > 0}\n`, {
          flag: 'a',
        });
    } else if (mode === 'upload-npm') {
      for (const file of state.missing.filter(file => file.language === 'typescript')) {
        // Publish with a batch-specific tag first: an old retry must never move latest backwards.
        runPreparationCommand(
          'npm',
          [
            'publish',
            resolve('sdk-publication/typescript', file.file),
            '--ignore-scripts',
            '--provenance',
            '--access=public',
            `--tag=sdk-release-${batch.id}`,
          ],
          process.cwd()
        );
      }
      for (const file of files.filter(file => file.language === 'typescript')) {
        const current = await reconcileRegistry([file], source);
        if (current.missing.length)
          throw new Error(`npm upload not yet visible: ${file.name}@${file.version}`);
        if (current.tagsToRepair.length)
          runPreparationCommand(
            'npm',
            ['dist-tag', 'add', `${file.name}@${file.version}`, 'latest'],
            process.cwd()
          );
      }
    }
    if (mode === 'verify' && process.env.GITHUB_STEP_SUMMARY)
      await writeFile(
        process.env.GITHUB_STEP_SUMMARY,
        'Every selected registry file, npm stable tag and native provenance source is verified. Fresh public consumer verification follows.\n',
        { flag: 'a' }
      );
  } catch (error) {
    if (error instanceof TerminalPublicationError && process.env.GITHUB_OUTPUT)
      await writeFile(process.env.GITHUB_OUTPUT, 'terminal=true\n', { flag: 'a' });
    throw error;
  }
}
