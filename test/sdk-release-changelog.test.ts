import { describe, expect, test } from 'bun:test';
import {
  collectChangelogInput,
  type ChangelogCollection,
} from '../.github/scripts/sdk-release/collect-changelog-input';
import {
  generateChangelog,
  generationKey,
  type FetchLike,
  type GenerationRecord,
} from '../.github/scripts/sdk-release/generate-changelog';
import {
  renderChangelog,
  validateChangelogOutput,
} from '../.github/scripts/sdk-release/render-changelog';

const release = (): ChangelogCollection =>
  collectChangelogInput({
    release_id: 'sdk-2026-07-30',
    date: '2026-07-30',
    packages: [
      {
        ecosystem: 'typescript',
        name: '@composio/core',
        version: '0.14.1',
        registry: 'npm',
        dist_tag: 'latest',
      },
      {
        ecosystem: 'python',
        name: 'composio',
        version: '0.18.1',
        registry: 'pypi',
      },
    ],
    changesets: [
      {
        id: 'kind-cats-smile',
        summary: 'Add deterministic release preparation.',
      },
    ],
    pull_requests: [
      {
        number: 4001,
        title: 'Fix connected account refresh',
        body: 'Fixes refresh failures and documents migration guidance.',
        url: 'https://github.com/ComposioHQ/composio/pull/4001',
        merged_at: '2026-07-29T10:00:00Z',
        merge_commit_sha: 'a'.repeat(40),
      },
    ],
  });

const modelOutput = {
  schema_version: 'sdk-release-changelog/v1' as const,
  summary: {
    text: 'This release improves SDK release preparation.',
    source_ids: ['changeset:kind-cats-smile'],
  },
  sections: [
    {
      kind: 'improvements' as const,
      claims: [
        {
          text: 'Release preparation is now deterministic.',
          source_ids: ['changeset:kind-cats-smile'],
        },
      ],
    },
    {
      kind: 'bug_fixes' as const,
      claims: [
        {
          text: 'Connected account refresh failures are fixed.',
          source_ids: ['pr:4001'],
        },
      ],
    },
  ],
};

function completedResponse(output: unknown = modelOutput, overrides: Record<string, unknown> = {}) {
  return {
    id: 'resp_123',
    status: 'completed',
    model: 'gpt-5.5-2026-04-23',
    output: [
      { type: 'reasoning', id: 'rs_123', summary: [] },
      {
        type: 'message',
        id: 'msg_123',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    ...overrides,
  };
}

function responseFetch(
  responses: Array<Response | Error>,
  requests: Array<{ url: string; init?: RequestInit }>
): FetchLike {
  return async (url, init) => {
    requests.push({ url: String(url), init });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error('Mock Responses endpoint exhausted');
    return response;
  };
}

describe('SDK release changelog input and rendering', () => {
  test('collects bounded canonical sources and rejects unverifiable metadata', () => {
    const input = release();
    expect(input.sources.map(source => source.id)).toEqual([
      'changeset:kind-cats-smile',
      'pr:4001',
    ]);
    expect(input.packages.map(item => item.name)).toEqual(['composio', '@composio/core']);

    expect(() =>
      collectChangelogInput({
        release_id: 'sdk-2026-07-30',
        date: '2026-07-30',
        packages: release().packages,
        changesets: [],
        pull_requests: [
          {
            number: 4001,
            title: 'Wrong repository',
            body: '',
            url: 'https://example.com/pull/4001',
            merged_at: '2026-07-29T10:00:00Z',
            merge_commit_sha: 'a'.repeat(40),
          },
        ],
      })
    ).toThrow('verified GitHub pull request URL');

    expect(() =>
      collectChangelogInput({
        release_id: 'sdk-2026-07-30',
        date: '2026-07-30',
        packages: release().packages,
        changesets: [{ id: 'too-large', summary: 'x'.repeat(4_001) }],
        pull_requests: [],
      })
    ).toThrow();
  });

  test('renders a stable safe draft with owned frontmatter, table, headings, and filename', () => {
    const output = validateChangelogOutput(modelOutput, release());
    const rendered = renderChangelog(release(), output);

    expect(rendered.draft_path).toBe('.github/sdk-release/drafts/sdk-2026-07-30.mdx');
    expect(rendered.final_path).toBe('docs/content/changelog/07-30-26-sdk-2026-07-30.mdx');
    expect(rendered.mdx).toMatchSnapshot();

    const injected = validateChangelogOutput(
      {
        ...modelOutput,
        summary: {
          text: '# **danger** <script>{danger}</script> [link](javascript:alert(1))',
          source_ids: ['changeset:kind-cats-smile'],
        },
      },
      release()
    );
    const safe = renderChangelog(release(), injected).mdx;
    expect(safe).not.toContain('<script>');
    expect(safe).not.toContain('javascript:');
    expect(safe).not.toContain('# **danger**');
    expect(safe).toContain('&#35; &#42;&#42;danger&#42;&#42;');
    expect(safe).toContain('&lt;script&gt;');
  });

  test('rejects invented sources and breaking claims without migration evidence', () => {
    expect(() =>
      validateChangelogOutput(
        {
          ...modelOutput,
          sections: [
            {
              kind: 'bug_fixes',
              claims: [{ text: 'Invented.', source_ids: ['pr:9999'] }],
            },
          ],
        },
        release()
      )
    ).toThrow('allowlisted source');

    expect(() =>
      validateChangelogOutput(
        {
          ...modelOutput,
          sections: [
            {
              kind: 'breaking_changes',
              claims: [
                {
                  text: 'A contract changed.',
                  source_ids: ['pr:4001'],
                },
              ],
            },
          ],
        },
        release()
      )
    ).toThrow();
  });
});

describe('pinned mock Responses generation', () => {
  test('sends the golden request and records hashes without exposing the key', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const result = await generateChangelog({
      input: release(),
      apiKey: 'test-secret',
      endpoint: 'https://mock.openai.test/v1/responses',
      fetch: responseFetch([Response.json(completedResponse())], requests),
      sleep: async () => {},
      random: () => 0,
    });

    expect(result.action).toBe('generated');
    if (result.action !== 'generated') throw new Error('expected generation');
    expect(requests).toHaveLength(1);
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchSnapshot();
    expect(requests[0]?.init?.headers).toEqual({
      Authorization: 'Bearer test-secret',
      'Content-Type': 'application/json',
    });
    expect(JSON.stringify(result.record)).not.toContain('test-secret');
    expect(result.record).toMatchObject({
      model: 'gpt-5.5-2026-04-23',
      response_id: 'resp_123',
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    });
  });

  test('fails closed for model, status, refusal, tool call, duplicate output, JSON, schema, and source drift', async () => {
    const cases = [
      completedResponse(modelOutput, { model: 'gpt-5.5' }),
      completedResponse(modelOutput, { status: 'incomplete' }),
      completedResponse(modelOutput, {
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal', refusal: 'No.' }],
          },
        ],
      }),
      completedResponse(modelOutput, {
        output: [{ type: 'function_call', name: 'publish', arguments: '{}' }],
      }),
      completedResponse(modelOutput, {
        output: [completedResponse().output[1], completedResponse().output[1]],
      }),
      completedResponse(modelOutput, {
        output: [completedResponse().output[1], { type: 'reasoning', id: 'rs_late', summary: [] }],
      }),
      completedResponse(modelOutput, {
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: '{invalid' }],
          },
        ],
      }),
      completedResponse({ ...modelOutput, extra: true }),
      completedResponse({
        ...modelOutput,
        sections: [
          {
            kind: 'bug_fixes',
            claims: [{ text: 'Invented.', source_ids: ['pr:9999'] }],
          },
        ],
      }),
    ];

    for (const response of cases) {
      await expect(
        generateChangelog({
          input: release(),
          apiKey: 'test-secret',
          endpoint: 'https://mock.openai.test/v1/responses',
          fetch: responseFetch([Response.json(response)], []),
          sleep: async () => {},
        })
      ).rejects.toThrow();
    }
  });

  test('retries only connection failures, 429, and 5xx', async () => {
    const retryable = [
      new TypeError('connection reset'),
      new Response('rate limited', { status: 429 }),
      new Response('unavailable', { status: 503 }),
      Response.json(completedResponse()),
    ];
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const sleeps: number[] = [];
    const result = await generateChangelog({
      input: release(),
      apiKey: 'test-secret',
      endpoint: 'https://mock.openai.test/v1/responses',
      fetch: responseFetch(retryable, requests),
      maxAttempts: 4,
      sleep: async delay => {
        sleeps.push(delay);
      },
      random: () => 0,
    });
    expect(result.action).toBe('generated');
    expect(requests).toHaveLength(4);
    expect(sleeps).toEqual([250, 500, 1000]);

    for (const status of [400, 401, 403, 404, 422]) {
      const attempted: Array<{ url: string; init?: RequestInit }> = [];
      await expect(
        generateChangelog({
          input: release(),
          apiKey: 'test-secret',
          endpoint: 'https://mock.openai.test/v1/responses',
          fetch: responseFetch([new Response('terminal', { status })], attempted),
          sleep: async () => {},
        })
      ).rejects.toThrow();
      expect(attempted).toHaveLength(1);
    }
  });

  test('bounds never-settling Responses requests inside the retry budget', async () => {
    const requests: AbortSignal[] = [];
    const sleeps: number[] = [];
    const caller = new AbortController();
    const neverSettling: FetchLike = async (_input, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error('expected a request abort signal');
      requests.push(signal);
      return await new Promise<Response>((_, reject) => {
        const rejectOnAbort = () => reject(signal.reason);
        if (signal.aborted) rejectOnAbort();
        else signal.addEventListener('abort', rejectOnAbort, { once: true });
      });
    };

    await expect(
      generateChangelog({
        input: release(),
        apiKey: 'test-secret',
        endpoint: 'https://mock.openai.test/v1/responses',
        fetch: neverSettling,
        maxAttempts: 2,
        requestTimeoutMs: 5,
        signal: caller.signal,
        sleep: async delay => {
          sleeps.push(delay);
        },
        random: () => 0,
      })
    ).rejects.toThrow('OpenAI Responses connection failed');

    expect(requests).toHaveLength(2);
    expect(requests.every(signal => signal.aborted)).toBe(true);
    expect(requests.every(signal => signal !== caller.signal)).toBe(true);
    expect(caller.signal.aborted).toBe(false);
    expect(sleeps).toEqual([250]);
  });

  test('requires a key only when a generation call is necessary', async () => {
    await expect(
      generateChangelog({
        input: release(),
        apiKey: '',
        endpoint: 'https://mock.openai.test/v1/responses',
        fetch: responseFetch([], []),
      })
    ).rejects.toThrow('OPENAI_API_KEY');
  });
});

describe('human-edit preservation matrix', () => {
  function existingRecord(rendered: string, input = release()): GenerationRecord {
    return {
      generation_key: generationKey(input),
      input_sha256: 'a'.repeat(64),
      prompt_sha256: 'b'.repeat(64),
      schema_sha256: 'c'.repeat(64),
      model_policy_sha256: 'd'.repeat(64),
      output_sha256: 'e'.repeat(64),
      rendered_sha256: new Bun.CryptoHasher('sha256').update(rendered).digest('hex'),
      prompt_version: 'sdk-release-changelog-prompt/v1',
      schema_version: 'sdk-release-changelog/v1',
      model_family: 'gpt-5.5',
      model: 'gpt-5.5-2026-04-23',
      model_sha256: 'f'.repeat(64),
      response_id: 'resp_old',
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      generated_at: '2026-07-30T00:00:00.000Z',
      reset_count: 0,
    };
  }

  test('same key and untouched draft is a no-op without an API call', async () => {
    const current = 'generated bytes';
    const result = await generateChangelog({
      input: release(),
      apiKey: '',
      existing: { draft: current, record: existingRecord(current) },
      fetch: responseFetch([], []),
    });
    expect(result.action).toBe('no_op');
  });

  test('regenerates an untouched draft on changed input', async () => {
    const current = 'generated bytes';
    const changed = { ...release(), date: '2026-07-31' };
    const result = await generateChangelog({
      input: changed,
      apiKey: 'test-secret',
      endpoint: 'https://mock.openai.test/v1/responses',
      existing: { draft: current, record: existingRecord(current) },
      fetch: responseFetch([Response.json(completedResponse())], []),
      sleep: async () => {},
    });
    expect(result.action).toBe('generated');
  });

  test('preserves human edits and requires an explicit reset for changed input', async () => {
    const generated = 'generated bytes';
    const human = 'human edited bytes';
    const record = existingRecord(generated);

    const unchanged = await generateChangelog({
      input: release(),
      apiKey: '',
      existing: { draft: human, record },
      fetch: responseFetch([], []),
    });
    expect(unchanged.action).toBe('preserved_human_edit');

    const changedInput = { ...release(), date: '2026-07-31' };
    const changed = await generateChangelog({
      input: changedInput,
      apiKey: '',
      existing: { draft: human, record },
      fetch: responseFetch([], []),
    });
    expect(changed.action).toBe('manual_merge_required');

    const reset = await generateChangelog({
      input: changedInput,
      apiKey: 'test-secret',
      reset: true,
      existing: { draft: human, record },
      endpoint: 'https://mock.openai.test/v1/responses',
      fetch: responseFetch([Response.json(completedResponse())], []),
      sleep: async () => {},
    });
    expect(reset.action).toBe('generated');
    if (reset.action !== 'generated') throw new Error('expected reset generation');
    expect(reset.review_invalidated).toBe(true);
    expect(reset.record.reset_count).toBe(1);
  });
});
