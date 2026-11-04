import {
  Config,
  Console,
  Effect,
  FileSystem,
  Match,
  Option,
  Path,
  Schedule,
  Schema,
  Stdio,
  Stream,
} from 'effect';
import { Toml } from 'effect/encoding';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import semver from 'semver';
import {
  GitHub,
  REPOSITORY_PATH,
  ReleaseRun,
  RunId,
  SDK_RELEASE_REPOSITORY,
  Sha,
  commentIssue,
  decodeBase64Content,
  fileAt,
  getRun,
  jobs,
  paginate,
  request,
  requestOptional,
  requireActiveMember,
} from './github';
import { Language, REGISTRY_LANES } from './lanes';
import {
  ensure,
  fail,
  formatJson,
  readJson,
  readOptionalFile,
  run,
  runMain,
  spawn,
  withoutReleaseTokens,
  writeFile,
} from './runtime';
import { BATCH_PATH, ReleaseBatch, ReleaseFile } from './source';
import { tagRunProblem, type ReleaseApp } from './tag-run';

const BRANCH = 'docs/auto-sdk-sync';
const MARKER = '<!-- sdk-release-docs -->';
const MAINTENANCE_TITLE = 'docs: align guides and pins with verified SDK releases';
const PATCH_PATH = '/tmp/sdk-docs-patch.json';
const GUIDES = 'docs/content/docs/';
const CONTENTS_CONCURRENCY = 8;

const Dependencies = Schema.Record(Schema.String, Schema.String);
const DocsManifest = Schema.StructWithRest(
  Schema.Struct({
    dependencies: Schema.optionalKey(Dependencies),
    devDependencies: Schema.optionalKey(Dependencies),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

export const DocsInput = Schema.Struct({
  runId: PositiveInt,
  batch: ReleaseBatch,
  sourceSha: Sha,
  verifiedRunId: PositiveInt,
  verifiedSourceSha: Sha,
  branchHead: Schema.NullOr(Sha),
  pendingFiles: Schema.Array(ReleaseFile),
  targets: Schema.Record(Schema.String, Schema.String),
  verifiedLanguages: Schema.Array(Language),
  summaries: Schema.Array(Schema.String),
});
export type DocsInput = typeof DocsInput.Type;
const DocsPatch = Schema.Struct({ input: DocsInput, files: Schema.Array(ReleaseFile) });

/** Pins every existing `@composio/*` dependency to its exact verified version, never below the installed one. */
export const pinDocsSdkVersions = (
  value: unknown,
  targets: Record<string, string>,
  installed: Record<string, string> = {}
) =>
  Effect.gen(function* () {
    const manifest: Record<string, unknown> = {
      ...(yield* Schema.decodeUnknownEffect(DocsManifest)(value)),
    };
    for (const section of ['dependencies', 'devDependencies'] as const) {
      const current = manifest[section] as Record<string, string> | undefined;
      if (!current) continue;
      const pinned = { ...current };
      for (const [name, range] of Object.entries(current)) {
        if (!name.startsWith('@composio/')) continue;
        const target = targets[name];
        const floor = semver.minVersion(range);
        if (!target || !semver.valid(target) || !floor)
          return yield* fail(`Missing verified SDK target: ${name}`);
        yield* ensure(
          !semver.lt(target, floor) && !(installed[name] && semver.lt(target, installed[name])),
          `Docs pin must not decrease: ${name}`
        );
        pinned[name] = target;
      }
      manifest[section] = pinned;
    }
    return manifest;
  });

/** Index of the closing quote of the JSON string that starts at `start`. */
const stringEnd = (text: string, start: number) => {
  let index = start + 1;
  while (index < text.length && text[index] !== '"') index += text[index] === '\\' ? 2 : 1;
  return index;
};

const stripComments = (text: string) => {
  let output = '';
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '"') {
      const end = stringEnd(text, index);
      output += text.slice(index, end + 1);
      index = end;
    } else if (text.startsWith('//', index)) {
      index = text.indexOf('\n', index);
      if (index === -1) break;
      output += '\n';
    } else if (text.startsWith('/*', index)) {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 1;
    } else output += text[index];
  }
  return output;
};

const stripTrailingCommas = (text: string) => {
  let output = '';
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '"') {
      const end = stringEnd(text, index);
      output += text.slice(index, end + 1);
      index = end;
      continue;
    }
    if (text[index] === ',') {
      let next = index + 1;
      while (next < text.length && /\s/.test(text[next])) next++;
      if (text[next] === '}' || text[next] === ']') continue;
    }
    output += text[index];
  }
  return output;
};

/** Converts Bun's JSONC lockfile text to JSON by dropping comments and trailing commas outside strings. */
const jsoncToJson = (text: string) => stripTrailingCommas(stripComments(text));

const BunLock = Schema.Struct({
  packages: Schema.Record(Schema.String, Schema.Array(Schema.Unknown)),
});
const SDK_PACKAGE = /^@composio\/[^/]+$/;

const lockedSdkVersions = (lock: string) =>
  Effect.gen(function* () {
    const { packages } = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(BunLock))(
      jsoncToJson(lock)
    );
    const installed: Record<string, string> = {};
    for (const [name, entry] of Object.entries(packages)) {
      if (!SDK_PACKAGE.test(name)) continue;
      const resolution = yield* Schema.decodeUnknownEffect(Schema.String)(entry[0]);
      const version = resolution.slice(`${name}@`.length);
      yield* ensure(
        resolution.startsWith(`${name}@`) && semver.valid(version) !== null,
        `Invalid locked SDK version: ${name}`
      );
      installed[name] = version;
    }
    return installed;
  });

type Freshness = Pick<DocsInput, 'sourceSha' | 'verifiedRunId' | 'branchHead'>;

export const requireFreshDocsInput = (selected: Freshness, current: Freshness) =>
  ensure(
    selected.sourceSha === current.sourceSha &&
      selected.verifiedRunId === current.verifiedRunId &&
      selected.branchHead === current.branchHead,
    'Protected docs, verified release or pending guide edits changed; regenerate from current inputs'
  );

type LiveRelease = Pick<DocsInput['batch'], 'date' | 'statusUrl'> & {
  plan: {
    releases: ReadonlyArray<
      Pick<DocsInput['batch']['plan']['releases'][number], 'name' | 'newVersion' | 'language'>
    >;
  };
};

/** The changelog page is published as HTML and as Markdown; each exposes the version table differently. */
const LIVE_PAGE_FORMATS: ReadonlyArray<{
  readonly suffix: string;
  readonly rows: (text: string) => ReadonlyArray<string>;
  readonly cells: (row: string) => ReadonlyArray<string>;
}> = [
  {
    suffix: '',
    rows: text => text.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [],
    cells: row => [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => cell[1]),
  },
  {
    suffix: '.md',
    rows: text => text.split('\n').filter(line => line.startsWith('|')),
    cells: row => row.split('|').slice(1, -1),
  },
];

/** Drops every `<...>` tag and stray angle bracket in one pass. */
const stripTags = (text: string) => {
  let output = '';
  let inTag = false;
  for (const char of text) {
    if (char === '<') inTag = true;
    else if (char === '>') inTag = false;
    else if (!inTag) output += char;
  }
  return output;
};

const cellText = (cell: string) => stripTags(cell).replaceAll('`', '').trim().replace(/\s+/g, ' ');

const fetchLive = (url: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(url).pipe(Effect.timeout('30 seconds'));
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: response.text,
    };
  }).pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'follow' }));

/** The live changelog shows the publication status and every released version, and each language's reference is up. */
export const verifyLiveReleaseDocs = (batch: LiveRelease) =>
  Effect.gen(function* () {
    const path = `/docs/changelog/${batch.date.replaceAll('-', '/')}`;
    for (const format of LIVE_PAGE_FORMATS) {
      const response = yield* fetchLive(`https://docs.composio.dev${path}${format.suffix}`);
      yield* ensure(response.ok, `Release documentation unavailable (${response.status})`);
      const text = (yield* response.text).replaceAll('&#x40;', '@').replaceAll('&commat;', '@');
      const rows = format.rows(text).map(row => format.cells(row).map(cellText));
      yield* ensure(
        text.includes(batch.statusUrl) &&
          batch.plan.releases.every(release =>
            rows.some(
              cells =>
                cells[0] === REGISTRY_LANES[release.language].docsLabel(release.name) &&
                cells[1] === release.newVersion
            )
          ),
        'Live documentation does not yet contain the reviewed release targets and publication status'
      );
    }
    for (const language of new Set(batch.plan.releases.map(release => release.language))) {
      const response = yield* fetchLive(
        `https://docs.composio.dev/reference/sdk-reference/${language}/tools`
      );
      yield* ensure(
        response.ok && (yield* response.text).includes('Tools'),
        `Live ${language} SDK reference unavailable`
      );
    }
  });

const FileContent = Schema.Struct({ encoding: Schema.Literal('base64'), content: Schema.String });

/** A file's contents at `ref`, or null when it does not exist there. */
const contents = (path: string, ref: string) =>
  Effect.gen(function* () {
    const file = yield* requestOptional(
      `${REPOSITORY_PATH}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      FileContent
    );
    return Option.isSome(file) ? yield* decodeBase64Content(file.value.content) : null;
  });

const refSha = (name: string) =>
  Effect.map(
    requestOptional(
      `${REPOSITORY_PATH}/git/ref/heads/${name}`,
      Schema.Struct({ object: Schema.Struct({ sha: Sha }) })
    ),
    ref => Option.map(ref, found => found.object.sha)
  );

const VERIFY_JOB = 'Verify public SDK packages';

/** A release App tag run whose tag has not moved and whose public package verification succeeded. */
const isVerifiedRelease = (run: ReleaseRun, app: ReleaseApp) =>
  Effect.gen(function* () {
    if ((yield* tagRunProblem(run, app)) !== undefined) return false;
    const runJobs = yield* jobs(String(run.id));
    return runJobs.some(job => job.name === VERIFY_JOB && job.conclusion === 'success');
  });

/** The batch a tag run published, read from its tagged commit. */
const batchAt = (run: ReleaseRun) =>
  Effect.gen(function* () {
    const file = yield* fileAt(BATCH_PATH, run.head_sha ?? '');
    if (Option.isNone(file)) return yield* fail('Publication run and frozen batch differ');
    const batch = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ReleaseBatch))(
      file.value
    );
    yield* ensure(
      run.head_branch === `sdk-release/${batch.id}`,
      'Publication run and frozen batch differ'
    );
    return batch;
  });

/** The newest publication run whose packages were verified, and the batch it published. */
export const newestVerifiedRelease = (app: ReleaseApp) =>
  Effect.gen(function* () {
    const latest = yield* paginate(
      `${REPOSITORY_PATH}/actions/workflows/sdk.release.yml/runs?event=push`,
      Schema.Struct({ workflow_runs: Schema.Array(ReleaseRun) }),
      body => body.workflow_runs
    ).pipe(
      Stream.filterEffect(run => isVerifiedRelease(run, app)),
      Stream.runHead
    );
    if (Option.isNone(latest)) return yield* fail('No verified SDK release is available');
    return { run: latest.value, batch: yield* batchAt(latest.value) };
  });

const allowedDocsPath = (path: string) =>
  /^docs\/content\/docs\/(?!.*(?:^|\/)\.\.\/)[a-zA-Z0-9_./-]+\.mdx$/.test(path) ||
  ['docs/package.json', 'docs/bun.lock'].includes(path);

const PackageManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  private: Schema.optionalKey(Schema.Boolean),
});
const PyProject = Schema.Struct({
  project: Schema.Struct({ name: Schema.String, version: Schema.String }),
});

/** Manifests in the verified source that name released packages, and how each yields a `[name, version]` target. */
const TARGET_MANIFESTS: ReadonlyArray<{
  readonly path: RegExp;
  readonly target: (
    text: string
  ) => Effect.Effect<Option.Option<readonly [string, string]>, unknown>;
}> = [
  {
    path: /^ts\/packages\/(?:[^/]+|providers\/[^/]+)\/package\.json$/,
    target: text =>
      Effect.map(
        Schema.decodeUnknownEffect(Schema.fromJsonString(PackageManifest))(text),
        manifest =>
          manifest.private ? Option.none() : Option.some([manifest.name, manifest.version] as const)
      ),
  },
  {
    path: /^python\/(?:providers\/[^/]+\/)?pyproject\.toml$/,
    target: text =>
      Effect.fromResult(Toml.parse(text)).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(PyProject)),
        Effect.map(({ project }) => Option.some([project.name, project.version] as const))
      ),
  },
];

const verifiedTargets = (
  latest: Effect.Success<ReturnType<typeof newestVerifiedRelease>>,
  tree: ReadonlyArray<{ path: string; type: string }>
) =>
  Effect.gen(function* () {
    const ref = latest.run.head_sha ?? '';
    const found = yield* Effect.forEach(
      TARGET_MANIFESTS.flatMap(manifest =>
        tree
          .filter(item => item.type === 'blob' && manifest.path.test(item.path))
          .map(item => ({ manifest, path: item.path }))
      ),
      ({ manifest, path }) =>
        Effect.flatMap(contents(path, ref), text => manifest.target(text ?? 'null')),
      { concurrency: CONTENTS_CONCURRENCY }
    );
    return Object.fromEntries(found.flatMap(Option.toArray));
  });

const pendingDocsFiles = (sourceSha: string, branchHead: string) =>
  Effect.gen(function* () {
    const comparison = yield* request(
      'GET',
      `${REPOSITORY_PATH}/compare/${sourceSha}...${branchHead}`,
      Schema.Struct({
        files: Schema.Array(Schema.Struct({ filename: Schema.String })).check(
          Schema.isMaxLength(299)
        ),
      })
    );
    yield* ensure(
      comparison.files.every(file => allowedDocsPath(file.filename)),
      'Pending docs branch contains changes outside guides and SDK pins'
    );
    return yield* Effect.forEach(
      comparison.files,
      file =>
        Effect.map(
          Effect.all([contents(file.filename, sourceSha), contents(file.filename, branchHead)]),
          ([before, after]) => ({ path: file.filename, before, after })
        ),
      { concurrency: CONTENTS_CONCURRENCY }
    );
  });

/** Everything docs maintenance needs, captured once from the verified release and the current protected docs. */
export const selectDocsInput = (runId: string, app: ReleaseApp) =>
  Effect.gen(function* () {
    const target = yield* getRun(runId);
    yield* ensure(
      yield* isVerifiedRelease(target, app),
      'Public registry verification must succeed before SDK docs maintenance'
    );
    const batch = yield* batchAt(target);
    const latest = yield* newestVerifiedRelease(app);
    const sourceSha = yield* Effect.flatMap(
      refSha('next'),
      Option.match({
        onNone: () => fail('Protected next is unavailable'),
        onSome: Effect.succeed,
      })
    );
    const branchHead = Option.getOrNull(yield* refSha(BRANCH));
    const pendingFiles = branchHead === null ? [] : yield* pendingDocsFiles(sourceSha, branchHead);
    const tree = yield* request(
      'GET',
      `${REPOSITORY_PATH}/git/trees/${latest.run.head_sha}?recursive=1`,
      Schema.Struct({
        truncated: Schema.Literal(false),
        tree: Schema.Array(Schema.Struct({ path: Schema.String, type: Schema.String })),
      })
    );
    return yield* Schema.decodeUnknownEffect(DocsInput)({
      runId: target.id,
      batch,
      sourceSha,
      verifiedRunId: latest.run.id,
      verifiedSourceSha: latest.run.head_sha,
      branchHead,
      pendingFiles,
      targets: yield* verifiedTargets(latest, tree.tree),
      verifiedLanguages: [...new Set(latest.batch.plan.releases.map(release => release.language))],
      summaries: latest.batch.plan.changesets.map(note => note.summary),
    });
  });

/** A file at a git revision, or `None` when it does not exist there. */
const gitShow = (cwd: string, rev: string, path: string) =>
  Effect.map(
    spawn('git', ['show', `${rev}:${path}`], { cwd, env: withoutReleaseTokens }),
    result => (result.exitCode === 0 ? Option.some(result.stdout) : Option.none<string>())
  );

const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  run('git', args, { cwd, env: withoutReleaseTokens });

const requireNoControllerToken = (message: string) =>
  Effect.gen(function* () {
    const token = yield* Config.option(Config.String('SDK_RELEASE_TOKEN'));
    yield* ensure(Option.isNone(token) || token.value === '', message);
  });

type GuideChange =
  | { readonly _tag: 'Deleted' }
  | { readonly _tag: 'Created'; readonly after: string }
  | { readonly _tag: 'Edited'; readonly before: string; readonly after: string };

const guideChange = ({ before, after }: ReleaseFile): GuideChange =>
  after === null
    ? { _tag: 'Deleted' }
    : before === null
      ? { _tag: 'Created', after }
      : { _tag: 'Edited', before, after };

/**
 * Re-applies a pending guide edit onto current protected docs. Edits merge three-way against the
 * pending branch's merge base, so protected changes survive and overlapping edits fail.
 */
const applyPendingGuide = (cwd: string, file: ReleaseFile, ancestor: Option.Option<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = path.resolve(cwd, file.path);
    yield* Match.valueTags(guideChange(file), {
      Deleted: () =>
        Effect.gen(function* () {
          yield* ensure(
            file.before === Option.getOrNull(ancestor),
            'Pending guide deletion conflicts with newer docs'
          );
          yield* fs.remove(target);
        }),
      Created: ({ after }) =>
        Effect.gen(function* () {
          yield* ensure(
            Option.isNone(ancestor),
            'Pending guide edits conflict with a newer protected deletion'
          );
          yield* fs.makeDirectory(path.dirname(target), { recursive: true });
          yield* fs.writeFileString(target, after);
        }),
      Edited: ({ before, after }) =>
        Effect.scoped(
          Effect.gen(function* () {
            const scratch = yield* fs.makeTempDirectoryScoped({ prefix: 'sdk-guide-' });
            const [current, base, pending] = ['current', 'base', 'pending'].map(name =>
              path.join(scratch, name)
            );
            yield* fs.writeFileString(current, before);
            yield* fs.writeFileString(
              base,
              Option.getOrElse(ancestor, () => '')
            );
            yield* fs.writeFileString(pending, after);
            const merged = yield* spawn('git', ['merge-file', '-p', current, base, pending], {
              cwd,
              env: withoutReleaseTokens,
            });
            yield* ensure(
              merged.exitCode === 0,
              'Pending guide edits conflict with current protected docs; resolve the maintenance PR'
            );
            yield* fs.writeFileString(target, merged.stdout);
          })
        ),
    });
  });

const prepareDocs = (cwd: string, input: DocsInput) =>
  Effect.gen(function* () {
    yield* requireNoControllerToken('Docs generation must not receive controller credentials');
    yield* ensure(
      (yield* git(cwd, 'rev-parse', 'HEAD')).trim() === input.sourceSha,
      'Docs source differs from current protected input'
    );
    const mergeBase = yield* Effect.cached(
      input.branchHead
        ? Effect.map(git(cwd, 'merge-base', input.sourceSha, input.branchHead), base => base.trim())
        : Effect.succeed(input.sourceSha)
    );
    for (const file of input.pendingFiles) {
      yield* ensure(allowedDocsPath(file.path), 'Invalid pending docs path');
      if (!file.path.startsWith(GUIDES)) continue;
      yield* ensure(
        Option.getOrNull(yield* gitShow(cwd, input.sourceSha, file.path)) === file.before,
        'Pending guide baseline differs'
      );
      yield* applyPendingGuide(cwd, file, yield* gitShow(cwd, yield* mergeBase, file.path));
    }
    const fs = yield* FileSystem.FileSystem;
    const installed = yield* lockedSdkVersions(yield* fs.readFileString(`${cwd}/docs/bun.lock`));
    const pendingLock = input.pendingFiles.find(file => file.path === 'docs/bun.lock')?.after;
    if (pendingLock)
      for (const [name, version] of Object.entries(yield* lockedSdkVersions(pendingLock)))
        if (!installed[name] || semver.gt(version, installed[name])) installed[name] = version;
    const manifest = yield* pinDocsSdkVersions(
      JSON.parse(yield* fs.readFileString(`${cwd}/docs/package.json`)),
      input.targets,
      installed
    );
    yield* writeFile(`${cwd}/docs/package.json`, formatJson(manifest));
  });

const nulSeparated = (output: string) => output.split('\0').filter(Boolean);

const captureDocsPatch = (cwd: string, input: DocsInput) =>
  Effect.gen(function* () {
    const paths = [
      ...new Set([
        ...nulSeparated(yield* git(cwd, 'diff', '--name-only', '-z', input.sourceSha)),
        ...nulSeparated(yield* git(cwd, 'ls-files', '--others', '--exclude-standard', '-z')),
      ]),
    ];
    const files = [];
    for (const path of paths) {
      yield* ensure(allowedDocsPath(path), `Docs maintenance changed an unowned path: ${path}`);
      files.push({
        path,
        before: Option.getOrNull(yield* gitShow(cwd, input.sourceSha, path)),
        after: Option.getOrNull(yield* readOptionalFile(`${cwd}/${path}`)),
      });
    }
    return yield* Schema.decodeUnknownEffect(DocsPatch)({ input, files });
  });

const CreatedSha = Schema.Struct({ sha: Sha });
const RefObject = Schema.Struct({ object: Schema.Struct({ sha: Sha }) });
const PullNumber = Schema.Struct({ number: Schema.Number });

/** The docs manifest may change only by pinning SDK packages to the verified targets. */
const verifyManifestPins = (file: ReleaseFile, latest: DocsInput) =>
  Effect.gen(function* () {
    const lock = yield* contents('docs/bun.lock', latest.sourceSha);
    if (!lock || !file.before || !file.after)
      return yield* fail('Docs manifest changes more than exact verified SDK pins');
    const pinned = yield* pinDocsSdkVersions(
      JSON.parse(file.before),
      latest.targets,
      yield* lockedSdkVersions(lock)
    );
    yield* ensure(
      JSON.stringify(JSON.parse(file.after)) === JSON.stringify(pinned),
      'Docs manifest changes more than exact verified SDK pins'
    );
  });

const publishMaintenanceBranch = (latest: DocsInput, sha: string) =>
  latest.branchHead
    ? request('PATCH', `${REPOSITORY_PATH}/git/refs/heads/${BRANCH}`, RefObject, {
        sha,
        force: false,
      })
    : request('POST', `${REPOSITORY_PATH}/git/refs`, RefObject, {
        ref: `refs/heads/${BRANCH}`,
        sha,
      });

const upsertMaintenancePull = (latest: DocsInput) =>
  Effect.gen(function* () {
    const prs = yield* request(
      'GET',
      `${REPOSITORY_PATH}/pulls?state=open&base=next&head=ComposioHQ:${BRANCH}`,
      Schema.Array(Schema.Struct({ number: Schema.Number, body: Schema.NullOr(Schema.String) }))
    );
    const body = `${MARKER}\n## Summary\nUpdate guides and exact SDK pins from verified source ${latest.verifiedSourceSha}.\n\nThese maintenance changes receive ordinary review and docs example/build checks. Package publication and release completion do not wait for this PR.\n\nVerified publication run: https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${latest.verifiedRunId}`;
    yield* ensure(prs.length <= 1, 'Multiple SDK docs maintenance PRs are open');
    const [existing] = prs;
    yield* existing
      ? request('PATCH', `${REPOSITORY_PATH}/pulls/${existing.number}`, PullNumber, {
          body,
          title: MAINTENANCE_TITLE,
        })
      : request('POST', `${REPOSITORY_PATH}/pulls`, PullNumber, {
          head: BRANCH,
          base: 'next',
          title: MAINTENANCE_TITLE,
          body,
        });
  });

/** Commits a captured docs patch onto current protected docs if neither the inputs nor the pending branch moved. */
export const commitDocsPatch = (value: unknown, app: ReleaseApp) =>
  Effect.gen(function* () {
    const patch = yield* Schema.decodeUnknownEffect(DocsPatch)(value);
    const latest = yield* selectDocsInput(String(patch.input.runId), app);
    yield* requireFreshDocsInput(patch.input, latest);
    for (const file of patch.files) {
      yield* ensure(
        allowedDocsPath(file.path) &&
          (yield* contents(file.path, latest.sourceSha)) === file.before,
        'Docs patch source or path differs'
      );
      if (file.path === 'docs/package.json') yield* verifyManifestPins(file, latest);
    }
    if (!patch.files.length) return { changed: false };
    const commit = yield* request(
      'GET',
      `${REPOSITORY_PATH}/git/commits/${latest.sourceSha}`,
      Schema.Struct({ tree: Schema.Struct({ sha: Sha }) })
    );
    const tree = yield* request('POST', `${REPOSITORY_PATH}/git/trees`, CreatedSha, {
      base_tree: commit.tree.sha,
      tree: patch.files.map(file => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        ...(file.after === null ? { sha: null } : { content: file.after }),
      })),
    });
    const next = yield* request('POST', `${REPOSITORY_PATH}/git/commits`, CreatedSha, {
      message: MAINTENANCE_TITLE,
      tree: tree.sha,
      parents: [latest.sourceSha, ...(latest.branchHead ? [latest.branchHead] : [])],
    });
    yield* requireFreshDocsInput(latest, yield* selectDocsInput(String(patch.input.runId), app));
    yield* publishMaintenanceBranch(latest, next.sha);
    yield* upsertMaintenancePull(latest);
    return { changed: true };
  });

const Mode = Schema.Literals(['context', 'prepare', 'capture', 'commit', 'live', 'deploy']);
type Mode = typeof Mode.Type;

const inputPath = Config.String('SDK_DOCS_INPUT').pipe(
  Config.withDefault('/tmp/sdk-docs-input.json')
);
const controllerToken = Config.schema(Schema.NonEmptyString, 'SDK_RELEASE_TOKEN');
const NonEmpty = Schema.NonEmptyString;
const releaseApp = Config.all({
  id: Config.schema(
    Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThan(0)),
    'SDK_RELEASE_APP_ID'
  ),
  slug: Config.schema(NonEmpty, 'SDK_RELEASE_APP_SLUG'),
});

const withInput = <A, E, R>(use: (input: DocsInput, cwd: string) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const input = yield* readJson(DocsInput, yield* inputPath);
    return yield* use(input, (yield* Path.Path).resolve('.'));
  });

const asController = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.flatMap(controllerToken, token => program.pipe(Effect.provide(GitHub.layer(token))));

/** The live-docs check retries while the docs deployment rolls out: 20 attempts, 30 seconds apart. */
const LIVE_DOCS_RETRY = { schedule: Schedule.spaced('30 seconds'), times: 19 };

/**
 * Checks the live docs and, on a mismatch, warns on the release request issue. The packages are
 * already published, so this only reports; it never changes the publication.
 */
export const checkLiveDocs = (
  batch: LiveRelease,
  runUrl: string,
  retry: { readonly times: number } = LIVE_DOCS_RETRY
) =>
  verifyLiveReleaseDocs(batch).pipe(
    Effect.retry(retry),
    Effect.tapError(error =>
      Effect.gen(function* () {
        const issue = /\/issues\/(\d+)$/.exec(batch.statusUrl)?.[1];
        if (issue === undefined) return yield* fail('Release request must be a repository issue');
        yield* commentIssue(
          Number(issue),
          [
            'Warning: the live docs check failed after this release was published. The packages are published; only the docs are affected.',
            `Reason: ${error.message}`,
            `Docs run: ${runUrl}`,
          ].join('\n\n')
        );
      })
    )
  );

const deploy = Effect.gen(function* () {
  const hook = yield* Config.option(Config.String('VERCEL_DOCS_NEXT_DEPLOY_HOOK'));
  if (Option.isNone(hook) || hook.value === '')
    return yield* fail('Configure the protected-next Vercel docs deploy hook before docs recovery');
  const url = yield* Effect.try(() => new URL(hook.value));
  yield* ensure(
    url.origin === 'https://api.vercel.com' && url.pathname.startsWith('/v1/integrations/deploy/'),
    'Invalid native Vercel deploy hook'
  );
  const client = yield* HttpClient.HttpClient;
  const response = yield* client
    .execute(HttpClientRequest.post(url))
    .pipe(
      Effect.timeout('30 seconds'),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' })
    );
  yield* ensure(
    response.status >= 200 && response.status < 300,
    `Current protected docs deployment request failed (${response.status})`
  );
  yield* Console.log('Requested a native Vercel build of the configured protected next branch.');
});

const MODES = {
  prepare: withInput((input, cwd) => prepareDocs(cwd, input)),
  capture: withInput((input, cwd) =>
    Effect.flatMap(captureDocsPatch(cwd, input), patch =>
      writeFile(PATCH_PATH, JSON.stringify(patch))
    )
  ),
  live: withInput(input =>
    Effect.gen(function* () {
      const token = yield* Config.schema(Schema.NonEmptyString, 'GITHUB_TOKEN');
      const runId = yield* Config.schema(RunId, 'GITHUB_RUN_ID');
      yield* checkLiveDocs(
        input.batch,
        `https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${runId}`
      ).pipe(Effect.provide(GitHub.layer(token)));
    })
  ),
  deploy,
  context: asController(
    Effect.gen(function* () {
      const actor = yield* Config.schema(NonEmpty, 'GITHUB_ACTOR');
      const app = yield* releaseApp;
      // The tag run dispatches this workflow with its GITHUB_TOKEN.
      if (actor !== `${app.slug}[bot]` && actor !== 'github-actions[bot]')
        yield* requireActiveMember(actor);
      const runId = yield* Config.schema(RunId, 'SDK_DOCS_RUN_ID');
      const input = yield* selectDocsInput(runId, app);
      yield* writeFile(yield* inputPath, JSON.stringify(input));
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(
        yield* Config.String('GITHUB_OUTPUT'),
        `source-sha=${input.sourceSha}\n`,
        {
          flag: 'a',
        }
      );
    })
  ),
  commit: asController(
    Effect.gen(function* () {
      const patch = yield* readJson(Schema.Unknown, PATCH_PATH);
      yield* commitDocsPatch(patch, yield* releaseApp);
    })
  ),
};

const main = Effect.gen(function* () {
  const [argument] = yield* (yield* Stdio.Stdio).args;
  const mode = yield* Schema.decodeUnknownEffect(Mode)(argument);
  yield* MODES[mode];
});

if (import.meta.main) runMain(main);
