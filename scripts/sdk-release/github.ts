import { z } from 'zod';

export const SDK_RELEASE_REPOSITORY = 'ComposioHQ/composio';
export const runIdSchema = z.string().regex(/^[1-9][0-9]*$/);
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const pullSchema = z.object({
  number: z.number().int().positive(),
  html_url: z.string().url(),
  draft: z.boolean(),
  body: z.string().nullable(),
  head: z.object({ ref: z.string(), repo: z.object({ full_name: z.string() }).nullable() }),
});
export const releaseRunSchema = z.object({
  id: z.number().int().positive(),
  path: z.string(),
  head_branch: z.string().nullable(),
  repository: z.object({ full_name: z.string() }),
  status: z.string(),
  conclusion: z.string().nullable(),
  created_at: z.string().datetime(),
  run_attempt: z.number().int().positive(),
  html_url: z.string().url(),
});
export type ReleaseRun = z.infer<typeof releaseRunSchema>;
export type ReleaseFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class GitHubReleaseApiError extends Error {
  constructor(
    readonly status: number,
    method: string,
    path: string
  ) {
    super(`GitHub ${method} ${path} failed (${status})`);
  }
}

/** Only trusted controller code receives this App installation token. */
export class GitHubReleaseClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: ReleaseFetch = fetch
  ) {}

  async request<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//'))
      throw new Error('Expected a GitHub API path');
    const response = await this.fetcher(`https://api.github.com${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'x-github-api-version': '2026-03-10',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
    });
    if (!response.ok) throw new GitHubReleaseApiError(response.status, method, path);
    if (response.status === 204 || response.headers.get('content-length') === '0')
      return schema.parse(undefined);
    const text = await response.text();
    return schema.parse(text ? JSON.parse(text) : undefined);
  }

  async requireActiveMember(login: string): Promise<void> {
    const user = z
      .string()
      .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/)
      .parse(login);
    const membership = await this.request(
      'GET',
      `/orgs/ComposioHQ/memberships/${encodeURIComponent(user)}`,
      z.object({ state: z.enum(['active', 'pending']) })
    );
    if (membership.state !== 'active')
      throw new Error('An active ComposioHQ membership is required');
  }

  async findPilotPullRequest(): Promise<z.infer<typeof pullSchema> | undefined> {
    for (let page = 1; ; page++) {
      const pulls = await this.request(
        'GET',
        `/repos/${SDK_RELEASE_REPOSITORY}/pulls?state=open&base=next&per_page=100&page=${page}`,
        z.array(pullSchema)
      );
      const current = pulls.find(
        pull =>
          pull.draft &&
          pull.head.repo?.full_name === SDK_RELEASE_REPOSITORY &&
          /^sdk-release\/preview-\d+$/.test(pull.head.ref) &&
          pull.body?.includes('<!-- sdk-release-preview -->')
      );
      if (current) return current;
      if (pulls.length < 100) return undefined;
    }
  }

  async createPilotPullRequest(
    runId: string,
    sourceSha: string,
    contents: string
  ): Promise<string> {
    const id = runIdSchema.parse(runId);
    const source = shaSchema.parse(sourceSha);
    const commit = await this.request(
      'GET',
      `/repos/${SDK_RELEASE_REPOSITORY}/git/commits/${source}`,
      z.object({ sha: shaSchema, tree: z.object({ sha: shaSchema }) })
    );
    if (commit.sha !== source) throw new Error('Preview source commit did not match');
    const branch = `sdk-release/preview-${id}`;
    let existing: { object: { sha: string } } | undefined;
    try {
      existing = await this.request(
        'GET',
        `/repos/${SDK_RELEASE_REPOSITORY}/git/ref/heads/${branch}`,
        z.object({ object: z.object({ sha: shaSchema }) })
      );
    } catch (error) {
      if (!(error instanceof GitHubReleaseApiError) || error.status !== 404) throw error;
    }
    if (existing) {
      const saved = await this.request(
        'GET',
        `/repos/${SDK_RELEASE_REPOSITORY}/git/commits/${existing.object.sha}`,
        z.object({ parents: z.array(z.object({ sha: shaSchema })) })
      );
      const file = await this.request(
        'GET',
        `/repos/${SDK_RELEASE_REPOSITORY}/contents/.github/sdk-release-previews/${id}.json?ref=${existing.object.sha}`,
        z.object({ encoding: z.literal('base64'), content: z.string() })
      );
      const diff = await this.request(
        'GET',
        `/repos/${SDK_RELEASE_REPOSITORY}/compare/${source}...${existing.object.sha}`,
        z.object({ files: z.array(z.object({ filename: z.string(), status: z.string() })) })
      );
      if (
        diff.files.length !== 1 ||
        diff.files[0].filename !== `.github/sdk-release-previews/${id}.json` ||
        diff.files[0].status !== 'added' ||
        saved.parents.length !== 1 ||
        saved.parents[0].sha !== source ||
        Buffer.from(file.content, 'base64').toString('utf8') !== contents
      )
        throw new Error('The original preview branch no longer matches its source and plan');
    } else {
      const tree = await this.request(
        'POST',
        `/repos/${SDK_RELEASE_REPOSITORY}/git/trees`,
        z.object({ sha: shaSchema }),
        {
          base_tree: commit.tree.sha,
          tree: [
            {
              path: `.github/sdk-release-previews/${id}.json`,
              mode: '100644',
              type: 'blob',
              content: contents,
            },
          ],
        }
      );
      const prepared = await this.request(
        'POST',
        `/repos/${SDK_RELEASE_REPOSITORY}/git/commits`,
        z.object({ sha: shaSchema }),
        {
          message: 'chore(release): preview SDK release request',
          parents: [source],
          tree: tree.sha,
        }
      );
      await this.request(
        'POST',
        `/repos/${SDK_RELEASE_REPOSITORY}/git/refs`,
        z.object({ ref: z.string() }),
        {
          ref: `refs/heads/${branch}`,
          sha: prepared.sha,
        }
      );
    }
    const pull = await this.request('POST', `/repos/${SDK_RELEASE_REPOSITORY}/pulls`, pullSchema, {
      title: 'chore(release): preview SDK release request',
      base: 'next',
      head: branch,
      draft: true,
      body: `<!-- sdk-release-preview -->\nThis draft is a plan-only pilot. It does not change SDK versions, consume notes, update production docs, merge, create a source tag, or publish packages.\n\nOriginal run: https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${id}\n\nInspect the plan artifact and close this draft after the access test. Do not merge it.`,
    });
    return pull.html_url;
  }

  async commentIssue(issueNumber: number, body: string): Promise<void> {
    const issue = z.number().int().positive().parse(issueNumber);
    await this.request(
      'POST',
      `/repos/${SDK_RELEASE_REPOSITORY}/issues/${issue}/comments`,
      z.object({ id: z.number() }),
      { body }
    );
  }

  getRun(id: string): Promise<ReleaseRun> {
    const runId = runIdSchema.parse(id);
    return this.request(
      'GET',
      `/repos/${SDK_RELEASE_REPOSITORY}/actions/runs/${runId}`,
      releaseRunSchema
    );
  }

  async rerunFailedJobs(id: string): Promise<void> {
    const runId = runIdSchema.parse(id);
    await this.request(
      'POST',
      `/repos/${SDK_RELEASE_REPOSITORY}/actions/runs/${runId}/rerun-failed-jobs`,
      z.unknown()
    );
  }
}
