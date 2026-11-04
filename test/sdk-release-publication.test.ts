import { describe, expect, test } from 'bun:test';
import { Effect, Redacted, Schema } from 'effect';
import { Digest } from 'effect/crypto';
import { Base64 } from 'effect/encoding';
import type { Language } from '../scripts/sdk-release/lanes';
import {
  checkTrustedPublisher,
  inspectNpmProvenanceSubject,
  reconcileRegistry as reconcileRegistryEffect,
  verifyPublicationPolicy,
  waitForRegistry,
  type Distribution,
  verifyPublicationSource,
  type PublicationSource,
} from '../scripts/sdk-release/registry';
import { sha256Hex } from '../scripts/sdk-release/runtime';
import { ReleaseBatch } from '../scripts/sdk-release/source';
import { reportDocsNotStarted, reportFailure, reportRelease } from '../scripts/sdk-release/tag-run';
import {
  base,
  batch as controllerBatch,
  fakeController,
  head,
  type ControllerOptions,
} from './sdk-release-controller-fixture';
import { runRelease, type Fetch } from './sdk-release-harness';

const source: PublicationSource = { sha: 'a'.repeat(40), tag: 'sdk-release/8', runId: 9 };
const distribution = async (file: string, language: Language = 'python'): Promise<Distribution> => {
  const bytes = new TextEncoder().encode(`original ${file}`);
  return {
    language,
    name: language === 'python' ? 'composio' : '@composio/core',
    version: '1.0.1',
    file,
    bytes,
    sha256: await runRelease(sha256Hex(bytes)),
  };
};
const wheel = await distribution('composio-1.0.1-py3-none-any.whl');
const sdist = await distribution('composio-1.0.1.tar.gz');
const tarball = await distribution('composio-core-1.0.1.tgz', 'typescript');
const sha512 = (bytes: Uint8Array) =>
  runRelease(
    Effect.gen(function* () {
      return yield* (yield* Digest.Digest).digestHex(Digest.sha512, bytes);
    })
  );
const tarballSha512 = await sha512(tarball.bytes);
const reconcileRegistry = (files: Distribution[], fetch: Fetch) =>
  runRelease(reconcileRegistryEffect(files, source), fetch);
function provenance(sha = source.sha, tag = source.tag) {
  const statement = {
    subject: [
      {
        name: 'pkg:npm/%40composio/core@1.0.1',
        digest: { sha512: tarballSha512 },
      },
    ],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository: 'https://github.com/ComposioHQ/composio',
            path: '.github/workflows/sdk.release.yml',
            ref: `refs/tags/${tag}`,
          },
        },
        resolvedDependencies: [
          {
            uri: `git+https://github.com/ComposioHQ/composio@refs/tags/${tag}`,
            digest: { gitCommit: sha },
          },
        ],
      },
      runDetails: {
        metadata: {
          invocationId: `https://github.com/ComposioHQ/composio/actions/runs/${source.runId}/attempts/1`,
        },
      },
    },
  };
  return {
    attestations: [
      {
        predicateType: 'https://slsa.dev/provenance/v1',
        bundle: {
          dsseEnvelope: { payload: Base64.encode(JSON.stringify(statement)) },
        },
      },
    ],
  };
}
function registry(
  files: Distribution[],
  options: { conflict?: boolean; unknownPython?: boolean; newer?: boolean } = {}
) {
  const reads: string[] = [];
  return {
    reads,
    fetcher: (async (input: string | URL | Request) => {
      const url = String(input);
      reads.push(url);
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status });
      if (
        url.startsWith('https://files.pythonhosted.org/') ||
        url.startsWith('https://registry.npmjs.org/files/')
      ) {
        const file = files.find(file => url.endsWith(file.file));
        return new Response(
          options.conflict ? 'wrong bytes' : file ? new Uint8Array(file.bytes).buffer : undefined,
          { status: file ? 200 : 404 }
        );
      }
      if (url.endsWith('/attestations')) return json(provenance());
      if (url.startsWith('https://pypi.org/'))
        return files.some(file => file.language === 'python')
          ? json({
              urls: [
                ...files
                  .filter(file => file.language === 'python')
                  .map(file => ({
                    filename: file.file,
                    url: `https://files.pythonhosted.org/${file.file}`,
                    digests: { sha256: file.sha256 },
                  })),
                ...(options.unknownPython
                  ? [
                      {
                        filename: 'unreviewed.whl',
                        url: 'https://files.pythonhosted.org/unreviewed.whl',
                        digests: { sha256: 'f'.repeat(64) },
                      },
                    ]
                  : []),
              ],
            })
          : json({}, 404);
      if (url.endsWith('/latest')) return json({ version: options.newer ? '1.0.2' : '1.0.1' });
      if (url.startsWith('https://registry.npmjs.org/'))
        return files.some(file => file.language === 'typescript')
          ? json({
              name: tarball.name,
              version: tarball.version,
              dist: {
                tarball: `https://registry.npmjs.org/files/${tarball.file}`,
                attestations: { url: 'https://registry.npmjs.org/attestations' },
              },
            })
          : json({}, 404);
      throw new Error(`Unexpected registry fetch ${url}`);
    }) satisfies Fetch,
  };
}

describe('direct publication reconciliation', () => {
  test('valid tag-only environments include the native branch_policy protection rule', async () => {
    const fetch: Fetch = async input => {
      const path = new URL(String(input)).pathname;
      const value = path.endsWith('/deployment-branch-policies')
        ? { total_count: 1, branch_policies: [{ name: 'sdk-release/*', type: 'tag' }] }
        : path.endsWith('/rulesets')
          ? [{ id: 1, target: 'tag', enforcement: 'active' }]
          : path.endsWith('/rulesets/1')
            ? {
                conditions: { ref_name: { include: ['refs/tags/sdk-release/*'], exclude: [] } },
                bypass_actors: [
                  { actor_id: 123, actor_type: 'Integration', bypass_mode: 'always' },
                ],
                rules: ['creation', 'update', 'deletion'].map(type => ({ type })),
              }
            : {
                protection_rules: [{ type: 'branch_policy' }],
                deployment_branch_policy: {
                  protected_branches: false,
                  custom_branch_policies: true,
                },
              };
      return new Response(JSON.stringify(value));
    };
    await runRelease(verifyPublicationPolicy(new Set(['python']), 123), fetch);
  });
  test('a first run finds every candidate file missing', async () => {
    const result = await reconcileRegistry([tarball, wheel, sdist], registry([]).fetcher);
    expect(result.existing).toEqual([]);
    expect(result.missing.map(file => file.file)).toEqual([tarball.file, wheel.file, sdist.file]);
  });
  test('identical published files are accepted and only the missing sdist is left to upload', async () => {
    const fake = registry([wheel]);
    const result = await reconcileRegistry([wheel, sdist], fake.fetcher);
    expect(result.existing.map(file => file.file)).toEqual([wheel.file]);
    expect(result.missing.map(file => file.file)).toEqual([sdist.file]);
    expect(result.missing[0].bytes).toEqual(sdist.bytes);
    expect(fake.reads).toContain(`https://files.pythonhosted.org/${wheel.file}`);
  });
  test('a re-run after npm succeeded and PyPI failed leaves only the PyPI files to upload', async () => {
    const result = await reconcileRegistry([tarball, wheel, sdist], registry([tarball]).fetcher);
    expect(result.existing.map(file => file.file)).toEqual([tarball.file]);
    expect(result.missing.map(file => file.file)).toEqual([wheel.file, sdist.file]);
    expect(result.tagsToRepair).toEqual([]);
  });
  test('existing npm bytes and native provenance are checked before accepting a re-run', async () => {
    const fake = registry([tarball]);
    const result = await reconcileRegistry([tarball], fake.fetcher);
    expect(result.missing).toHaveLength(0);
    expect(fake.reads).toContain(`https://registry.npmjs.org/files/${tarball.file}`);
  });
  test('provenance must name the release tag ref and the approved head commit', async () => {
    await runRelease(inspectNpmProvenanceSubject(provenance(), tarball, source));
    await expect(
      runRelease(inspectNpmProvenanceSubject(provenance('b'.repeat(40)), tarball, source))
    ).rejects.toThrow('Native npm provenance source conflict: @composio/core');
    await expect(
      runRelease(
        inspectNpmProvenanceSubject(provenance(source.sha, 'sdk-release/7'), tarball, source)
      )
    ).rejects.toThrow('Native npm provenance source conflict: @composio/core');
  });
  test('published bytes that differ from the candidate stop with a conflict naming the file', async () => {
    await expect(
      reconcileRegistry([wheel, sdist], registry([wheel], { conflict: true }).fetcher)
    ).rejects.toThrow(`Registry content conflict: composio@1.0.1/${wheel.file}`);
    await expect(
      reconcileRegistry([wheel, sdist], registry([wheel], { unknownPython: true }).fetcher)
    ).rejects.toThrow('Unreviewed');
  });
  test('Python-only operation does not require npm outputs or requests', async () => {
    const fake = registry([wheel, sdist]);
    expect((await reconcileRegistry([wheel, sdist], fake.fetcher)).missing).toHaveLength(0);
    expect(fake.reads.some(url => url.includes('npmjs'))).toBe(false);
  });
  test('older retries accept a newer stable tag without requesting a downgrade', async () => {
    const result = await reconcileRegistry([tarball], registry([tarball], { newer: true }).fetcher);
    expect(result.tagsToRepair).toEqual([]);
  });
  test('bounded propagation ends with the exact incomplete file inventory', async () => {
    const fake = registry([wheel]);
    await expect(
      runRelease(
        waitForRegistry([wheel, sdist], source, { attempts: 3, spacing: '0 millis' }),
        fake.fetcher
      )
    ).rejects.toThrow(`after 3 attempts: composio@1.0.1/${sdist.file}`);
    expect(fake.reads.filter(url => url.startsWith('https://pypi.org/'))).toHaveLength(3);
  });
  test('a content conflict fails at once instead of waiting for propagation', async () => {
    const fake = registry([wheel], { conflict: true });
    await expect(
      runRelease(
        waitForRegistry([wheel, sdist], source, { attempts: 3, spacing: '0 millis' }),
        fake.fetcher
      )
    ).rejects.toThrow(`Registry content conflict: composio@1.0.1/${wheel.file}`);
    expect(fake.reads.filter(url => url.startsWith('https://pypi.org/'))).toHaveLength(1);
  });
  test('published bytes of the same length but different content are a conflict', async () => {
    const fake = registry([wheel, sdist]);
    const sameLength: Fetch = async input => {
      const response = await fake.fetcher(input);
      if (!String(input).endsWith(wheel.file)) return response;
      const bytes = new Uint8Array(await response.arrayBuffer());
      bytes[0] ^= 0xff;
      return new Response(bytes);
    };
    await expect(reconcileRegistry([wheel, sdist], sameLength)).rejects.toThrow(
      `Registry content conflict: composio@1.0.1/${wheel.file}`
    );
  });
});

const tagSource: PublicationSource = { sha: head, tag: 'sdk-release/8', runId: 77 };
const app = { id: 123, slug: 'sdk-release-app' };
const committedBatch = Schema.decodeUnknownSync(ReleaseBatch)(controllerBatch);

/** The release controller fake plus the tag run, App identity and merged PRs of the tag commit. */
async function fakeTagRun(
  options: ControllerOptions & {
    readonly actor?: string;
    readonly mergedPulls?: ReadonlyArray<{ number: number; head: { sha: string } }>;
  } = {}
) {
  const controller = await fakeController({ existingTag: head, ...options });
  const fetcher: Fetch = async (input, init) => {
    const path = new URL(String(input)).pathname.replace('/repos/ComposioHQ/composio', '');
    const response = (data: unknown) => new Response(JSON.stringify(data));
    if (path === '/actions/runs/77')
      return response({
        id: 77,
        path: '.github/workflows/sdk.release.yml',
        head_branch: 'sdk-release/8',
        head_sha: head,
        event: 'push',
        actor: { login: options.actor ?? 'sdk-release-app[bot]', type: 'Bot' },
        repository: { full_name: 'ComposioHQ/composio' },
        status: 'in_progress',
        conclusion: null,
        created_at: '2026-11-04T00:00:00Z',
        run_attempt: 1,
        html_url: 'https://github.com/ComposioHQ/composio/actions/runs/77',
      });
    if (path === '/apps/sdk-release-app') return response(app);
    if (path === `/commits/${head}/pulls`)
      return response(
        (options.mergedPulls ?? [{ number: 9, head: { sha: head } }]).map(pull => ({
          ...pull,
          merged_at: '2026-11-04T00:00:00Z',
        }))
      );
    return controller.fetcher(input, init);
  };
  return (verify = verifyPublicationSource(committedBatch, tagSource, app)) =>
    runRelease(verify, fetcher);
}

describe('publication preflight', () => {
  test('the App-pushed tag of the merged, approved release head is accepted', async () => {
    const verify = await fakeTagRun();
    expect((await verify()).number).toBe(9);
  });
  test('a tag pushed by an actor other than the release App is refused', async () => {
    const verify = await fakeTagRun({ actor: 'writer' });
    await expect(verify()).rejects.toThrow('not pushed by the dedicated SDK release App');
  });
  test('a tag whose commit is not the head of a merged release PR is refused', async () => {
    for (const mergedPulls of [[], [{ number: 9, head: { sha: base } }]]) {
      const verify = await fakeTagRun({ mergedPulls });
      await expect(verify()).rejects.toThrow('no unique merged release PR');
    }
  });
  test('the approval rule is re-checked: a requester approving their own release is refused', async () => {
    const verify = await fakeTagRun({ reviewer: 'requester' });
    await expect(verify()).rejects.toThrow(
      'lacks an approval from a writer other than the author and requesters'
    );
  });
});

describe('trusted-publisher preflight', () => {
  const idTokenRequest = {
    url: 'https://actions.test/token?api-version=2.0',
    token: Redacted.make('request-secret'),
  };
  const probe = (respond: (url: URL, init?: RequestInit) => Response) => {
    const calls: string[] = [];
    const fetch: Fetch = async (input, init) => {
      const url = new URL(String(input));
      calls.push(`${init?.method ?? 'GET'} ${url.host}${url.pathname}${url.search}`);
      if (url.host === 'actions.test') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer request-secret');
        return new Response(JSON.stringify({ value: 'id-secret' }));
      }
      return respond(url, init);
    };
    return { calls, fetch };
  };

  test('PyPI exchanges the pypi-audience ID token once and reports invalid-publisher', async () => {
    const accepted = probe(() => new Response(JSON.stringify({ token: 'pypi-secret' })));
    await runRelease(checkTrustedPublisher('python', [], idTokenRequest), accepted.fetch);
    expect(accepted.calls).toEqual([
      'GET actions.test/token?api-version=2.0&audience=pypi',
      'POST pypi.org/_/oidc/mint-token',
    ]);
    const refused = probe(
      () =>
        new Response(
          JSON.stringify({
            message: 'Token request failed',
            errors: [{ code: 'invalid-publisher', description: 'no corresponding publisher' }],
          }),
          { status: 422 }
        )
    );
    const error = await runRelease(
      checkTrustedPublisher('python', [], idTokenRequest),
      refused.fetch
    ).catch((cause: unknown) => String(cause));
    expect(error).toContain('failed (422): invalid-publisher: no corresponding publisher');
    expect(error).not.toContain('id-secret');
  });

  test('npm exchanges a fresh ID token per planned package and names the refused one', async () => {
    const { calls, fetch } = probe((url, init) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer id-secret');
      return url.pathname.endsWith('%2fslim')
        ? new Response(JSON.stringify({ message: 'no trusted publisher' }), { status: 404 })
        : new Response(JSON.stringify({ token: 'npm-secret' }));
    });
    const error = await runRelease(
      checkTrustedPublisher('typescript', ['@composio/core', '@composio/slim'], idTokenRequest),
      fetch
    ).catch((cause: unknown) => String(cause));
    expect(error).toContain('for @composio/slim failed (404): no trusted publisher');
    expect(error).not.toContain('secret');
    expect(calls).toEqual([
      'GET actions.test/token?api-version=2.0&audience=npm%3Aregistry.npmjs.org',
      'POST registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@composio%2fcore',
      'GET actions.test/token?api-version=2.0&audience=npm%3Aregistry.npmjs.org',
      'POST registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@composio%2fslim',
    ]);
  });

  test('both publish jobs wait for both registry publisher checks', async () => {
    const workflow = Bun.YAML.parse(await Bun.file('.github/workflows/sdk.release.yml').text()) as {
      jobs: Record<
        string,
        { needs: string[]; if: string; environment?: string; permissions?: Record<string, string> }
      >;
    };
    for (const [job, environment] of [
      ['npm-publisher-preflight', 'npm-release'],
      ['pypi-publisher-preflight', 'pypi-release'],
    ] as const) {
      expect(workflow.jobs[job].environment).toBe(environment);
      expect(workflow.jobs[job].permissions?.['id-token']).toBe('write');
    }
    for (const job of ['publish-npm', 'publish-pypi']) {
      const { needs, if: condition } = workflow.jobs[job];
      expect(needs).toEqual(
        expect.arrayContaining(['npm-publisher-preflight', 'pypi-publisher-preflight'])
      );
      expect(condition).toContain("needs.npm-publisher-preflight.result == 'success'");
      expect(condition).toContain("needs.pypi-publisher-preflight.result == 'success'");
    }
  });
});

const releaseWorkflow = async () =>
  Bun.YAML.parse(await Bun.file('.github/workflows/sdk.release.yml').text()) as {
    on: Record<string, unknown>;
    jobs: Record<
      string,
      {
        needs?: string | string[];
        if?: string;
        permissions?: Record<string, string>;
        steps?: {
          id?: string;
          name?: string;
          if?: string;
          run?: string;
          env?: Record<string, string>;
          'continue-on-error'?: boolean;
        }[];
      }
    >;
  };

/** A tag run whose committed batch reports to issue 8; records every issue comment. */
function reportingRun(jobs: ReadonlyArray<{ name: string; conclusion: string | null }> = []) {
  const comments: { issue: number; body: string }[] = [];
  const fetch: Fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/repos/ComposioHQ/composio', '') + url.search;
    const respond = (data: unknown) => new Response(JSON.stringify(data));
    if (path === `/contents/.github/sdk-release-plan.json?ref=${head}`)
      return respond({
        encoding: 'base64',
        content: Base64.encode(JSON.stringify(committedBatch)),
      });
    if (path === '/actions/runs/77/jobs?filter=latest&per_page=100&page=1')
      return respond({ jobs: jobs.map(job => ({ ...job, steps: [] })) });
    const comment = /^\/issues\/(\d+)\/comments$/.exec(path);
    if (comment && init?.method === 'POST') {
      comments.push({ issue: Number(comment[1]), body: JSON.parse(String(init.body)).body });
      return respond({ id: comments.length });
    }
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${path}`);
  };
  return { fetch, comments };
}

describe('release run reporting', () => {
  test('a verified publication posts one release comment with the versions and run URL', async () => {
    const run = reportingRun();
    await runRelease(reportRelease(head, '77'), run.fetch);
    expect(run.comments).toHaveLength(1);
    expect(run.comments[0].issue).toBe(8);
    expect(run.comments[0].body).toContain(
      'https://github.com/ComposioHQ/composio/actions/runs/77'
    );
    expect(run.comments[0].body).toContain('`@composio/core` 1.0.1');
  });
  test('a failed run posts one failure comment naming the failed job and the re-run', async () => {
    const run = reportingRun([
      { name: 'Check npm trusted publisher', conclusion: 'success' },
      { name: 'Publish original PyPI candidates', conclusion: 'failure' },
      { name: 'Verify public SDK packages', conclusion: 'skipped' },
    ]);
    await runRelease(reportFailure(head, '77'), run.fetch);
    expect(run.comments).toHaveLength(1);
    expect(run.comments[0].issue).toBe(8);
    expect(run.comments[0].body).toContain('failed in: Publish original PyPI candidates.');
    expect(run.comments[0].body).toContain('"Re-run failed jobs"');
    expect(run.comments[0].body).toContain(
      'If a re-run fails again with a registry content conflict or a missing or expired approved candidate, request a new release with supersede.'
    );
    expect(run.comments[0].body).toContain(
      'https://github.com/ComposioHQ/composio/actions/runs/77'
    );
  });
  test('a docs dispatch that did not start names the packages as published and the exact re-run', async () => {
    const run = reportingRun();
    await runRelease(reportDocsNotStarted(head, '77'), run.fetch);
    expect(run.comments).toEqual([
      {
        issue: 8,
        body: 'The packages are published, but docs maintenance did not start.\n\nStart it with:\n\n```sh\ngh workflow run docs.sdk-change-sync.yml --ref next -f run_id=77\n```',
      },
    ]);
  });
  test('after verification succeeds, the release is reported and docs maintenance dispatched once with its run ID', async () => {
    const workflow = await releaseWorkflow();
    const verification = workflow.jobs['registry-verification'];
    expect(verification.permissions).toBeUndefined();
    const announce = workflow.jobs['announce-release'];
    expect(announce.needs).toEqual(['registry-verification']);
    expect(announce.if).toContain("needs.registry-verification.result == 'success'");
    expect(announce.permissions).toEqual({ contents: 'read', actions: 'write', issues: 'write' });
    const steps = announce.steps ?? [];
    expect(steps.filter(step => step.run?.includes('tag-run.ts released'))).toHaveLength(1);
    const dispatches = Object.values(workflow.jobs).flatMap(job =>
      (job.steps ?? []).filter(step => step.run?.includes('docs.sdk-change-sync.yml'))
    );
    expect(dispatches).toHaveLength(1);
    expect(steps).toContain(dispatches[0]);
    expect(dispatches[0].env?.RUN_ID).toBe('${{ github.run_id }}');
    expect(dispatches[0].run).toContain('-f run_id="$RUN_ID"');
    const announcement = steps.find(step => step.run?.includes('tag-run.ts released'));
    expect(announcement?.['continue-on-error']).toBe(true);
    expect(dispatches[0]['continue-on-error']).toBe(true);
    const fallback = steps.find(step => step.run?.includes('tag-run.ts docs-not-started'));
    expect(fallback?.if).toBe(`steps.${dispatches[0].id}.outcome == 'failure'`);
  });
  test('a failure in any publish or verification job reaches the failure report', async () => {
    const workflow = await releaseWorkflow();
    const report = workflow.jobs['report-failure'];
    expect(report.if).toContain('failure()');
    expect(report.permissions?.issues).toBe('write');
    expect(report.steps?.some(step => step.run?.includes('tag-run.ts failed'))).toBe(true);
    const tagRunJobs = [
      'select-candidates',
      'candidate',
      'candidates-ready',
      'publication-preflight',
      'npm-publisher-preflight',
      'pypi-publisher-preflight',
      'publish-npm',
      'publish-pypi',
      'registry-verification',
    ];
    expect(report.needs).toEqual(expect.arrayContaining(tagRunJobs));
    expect(report.needs).not.toContain('announce-release');
    expect(workflow.on).not.toHaveProperty('workflow_run');
  });
});
