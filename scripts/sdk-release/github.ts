import { z } from 'zod';
import { downloadCandidate } from './artifact-download';

export const SDK_RELEASE_REPOSITORY = 'ComposioHQ/composio';
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const releaseRunSchema = z.object({
  id: z.number().int().positive(),
  path: z.string(),
  head_branch: z.string().nullable(),
  head_sha: shaSchema.optional(),
  event: z.string().optional(),
  actor: z.object({ login: z.string(), type: z.string() }).optional(),
  repository: z.object({ full_name: z.string() }),
  status: z.string(),
  conclusion: z.string().nullable(),
  created_at: z.string().datetime(),
  run_attempt: z.number().int().positive(),
  html_url: z.string().url(),
});
export type ReleaseRun = z.infer<typeof releaseRunSchema>;
export type ReleaseFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export const releaseJobSchema = z.object({
  name: z.string(),
  status: z.string().optional(),
  conclusion: z.string().nullable().optional(),
  steps: z
    .array(z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable() }))
    .default([]),
});

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

  async downloadArtifact(
    artifact: { id: number; digest: string },
    directory: string
  ): Promise<void> {
    await downloadCandidate(this.token, artifact, directory);
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
    const runId = z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .parse(id);
    return this.request(
      'GET',
      `/repos/${SDK_RELEASE_REPOSITORY}/actions/runs/${runId}`,
      releaseRunSchema
    );
  }

  async rerunFailedJobs(id: string): Promise<void> {
    const runId = z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .parse(id);
    await this.request(
      'POST',
      `/repos/${SDK_RELEASE_REPOSITORY}/actions/runs/${runId}/rerun-failed-jobs`,
      z.unknown()
    );
  }

  async jobs(id: string) {
    const jobs: z.infer<typeof releaseJobSchema>[] = [];
    for (let page = 1; ; page++) {
      const result = await this.request(
        'GET',
        `/repos/${SDK_RELEASE_REPOSITORY}/actions/runs/${id}/jobs?filter=all&per_page=100&page=${page}`,
        z.object({ jobs: z.array(releaseJobSchema) })
      );
      jobs.push(...result.jobs);
      if (result.jobs.length < 100) return jobs;
    }
  }
}
