import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { fetchToolkitFromProduction } from '../../lib/toolkit-api';

const originalApiKey = process.env.COMPOSIO_API_KEY;
const originalApiBase = process.env.COMPOSIO_API_BASE;
const originalFallback = process.env.COMPOSIO_TOOLKIT_LIVE_FALLBACK;
const originalFetch = globalThis.fetch;

const productionPayload = {
  slug: 'GitHub',
  name: 'GitHub',
  composio_managed_auth_schemes: ['oauth2', 'API_KEY'],
  auth_config_details: [
    {
      mode: 'OAuth2',
      name: 'github_oauth',
      fields: {
        auth_config_creation: {
          required: [
            {
              name: 'client_id',
              displayName: 'Client id',
              type: 'string',
              description: 'Client id of the app',
            },
          ],
          optional: [],
        },
        connected_account_initiation: { required: [], optional: [] },
      },
    },
    { mode: 'api_key', name: 'API key', fields: {} },
  ],
  meta: {
    logo: 'https://logos.composio.dev/api/github',
    description: 'GitHub description',
    categories: [{ name: 'developer tools' }],
    tools_count: 893,
    triggers_count: 20,
    version: '20260815_00',
  },
};

function useApiKey() {
  process.env.COMPOSIO_API_KEY = 'test-key';
  delete process.env.COMPOSIO_TOOLKIT_LIVE_FALLBACK;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();

  if (originalApiKey === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = originalApiKey;
  if (originalApiBase === undefined) delete process.env.COMPOSIO_API_BASE;
  else process.env.COMPOSIO_API_BASE = originalApiBase;
  if (originalFallback === undefined) delete process.env.COMPOSIO_TOOLKIT_LIVE_FALLBACK;
  else process.env.COMPOSIO_TOOLKIT_LIVE_FALLBACK = originalFallback;
});

describe('fetchToolkitFromProduction', () => {
  test('maps the single-toolkit response and normalizes auth modes', async () => {
    useApiKey();
    const fetcher = mock(async () => Response.json(productionPayload));
    globalThis.fetch = fetcher;

    const toolkit = await fetchToolkitFromProduction('GitHub');

    expect(toolkit).toEqual({
      slug: 'github',
      name: 'GitHub',
      logo: 'https://logos.composio.dev/api/github',
      description: 'GitHub description',
      category: 'developer tools',
      authSchemes: ['OAUTH2', 'API_KEY'],
      composioManagedAuthSchemes: ['OAUTH2', 'API_KEY'],
      toolCount: 893,
      triggerCount: 20,
      version: '20260815_00',
      tools: [],
      triggers: [],
      authConfigDetails: [
        {
          mode: 'OAUTH2',
          name: 'github_oauth',
          fields: {
            auth_config_creation: {
              required: [
                {
                  name: 'client_id',
                  displayName: 'Client id',
                  type: 'string',
                  description: 'Client id of the app',
                  required: true,
                  default: null,
                },
              ],
              optional: [],
            },
            connected_account_initiation: { required: [], optional: [] },
          },
        },
        {
          mode: 'API_KEY',
          name: 'API key',
          fields: {
            auth_config_creation: { required: [], optional: [] },
            connected_account_initiation: { required: [], optional: [] },
          },
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://backend.composio.dev/api/v3/toolkits/github');
    expect(fetcher.mock.calls[0]?.[1]).toEqual({
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-key' },
      next: { revalidate: 3600 },
    });
  });

  test('matches the committed snapshot key set and metadata defaults', async () => {
    useApiKey();
    const snapshotSchema = z.array(
      z.object({
        slug: z.string(),
        name: z.string(),
        logo: z.string().nullable(),
        description: z.string(),
        category: z.string().nullable(),
        authSchemes: z.array(z.string()),
        composioManagedAuthSchemes: z.array(z.string()).optional(),
        toolCount: z.number(),
        triggerCount: z.number(),
        version: z.string().nullable(),
        tools: z.array(z.unknown()),
        triggers: z.array(z.unknown()),
        authConfigDetails: z.array(z.unknown()).optional(),
      })
    );
    const snapshots = snapshotSchema.parse(
      JSON.parse(await readFile(join(import.meta.dir, '../../public/data/toolkits.json'), 'utf8'))
    );
    const snapshot = snapshots.find(toolkit => toolkit.slug === 'github');
    expect(snapshot).toBeDefined();
    if (!snapshot) throw new Error('Expected committed GitHub toolkit snapshot');

    globalThis.fetch = mock(async () =>
      Response.json({
        slug: snapshot.slug,
        name: snapshot.name,
        composio_managed_auth_schemes: snapshot.composioManagedAuthSchemes,
        auth_config_details: snapshot.authConfigDetails,
        meta: {
          logo: snapshot.logo,
          description: snapshot.description,
          categories: snapshot.category ? [{ name: snapshot.category }] : [],
          tools_count: snapshot.toolCount,
          triggers_count: snapshot.triggerCount,
          version: snapshot.version,
        },
      })
    );

    const toolkit = await fetchToolkitFromProduction(snapshot.slug);
    expect(toolkit).not.toBeNull();
    expect(Object.keys(toolkit ?? {}).sort()).toEqual(
      Object.keys({ ...snapshot, tools: [], triggers: [] }).sort()
    );
    expect(toolkit?.authSchemes).toEqual(snapshot.authSchemes);
    expect(toolkit?.composioManagedAuthSchemes).toEqual(snapshot.composioManagedAuthSchemes);
    expect(toolkit?.version).toBe(snapshot.version);
    expect(toolkit?.tools).toEqual([]);
    expect(toolkit?.triggers).toEqual([]);
  });

  test('degrades missing metadata and malformed auth details without throwing', async () => {
    useApiKey();
    globalThis.fetch = mock(async () =>
      Response.json({
        slug: 'LENIENT',
        name: 'Lenient',
        auth_config_details: [
          null,
          'junk',
          { name: 'missing mode' },
          {
            mode: 'oauth2',
            fields: {
              auth_config_creation: { required: [null], optional: [] },
            },
          },
        ],
      })
    );

    const toolkit = await fetchToolkitFromProduction('lenient');
    expect(toolkit).toMatchObject({
      slug: 'lenient',
      name: 'Lenient',
      logo: null,
      description: '',
      category: null,
      authSchemes: ['OAUTH2'],
      toolCount: 0,
      triggerCount: 0,
      version: null,
      tools: [],
      triggers: [],
    });
    expect(toolkit?.authConfigDetails).toHaveLength(1);
    expect(toolkit?.authConfigDetails?.[0]?.fields.auth_config_creation.required[0]).toEqual({
      name: '',
      displayName: '',
      type: 'string',
      description: '',
      required: true,
      default: null,
    });
  });

  test.each(['../etc', 'has space', 'A'.repeat(80), ''])(
    'rejects invalid slug %p before fetch',
    async slug => {
      useApiKey();
      const fetcher = mock(async () => Response.json(productionPayload));
      globalThis.fetch = fetcher;

      expect(await fetchToolkitFromProduction(slug)).toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  test('requires an API key and warns without fetching', async () => {
    delete process.env.COMPOSIO_API_KEY;
    delete process.env.COMPOSIO_TOOLKIT_LIVE_FALLBACK;
    const fetcher = mock(async () => Response.json(productionPayload));
    globalThis.fetch = fetcher;
    const warning = spyOn(console, 'warn').mockImplementation(() => {});

    expect(await fetchToolkitFromProduction('missing-key')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledTimes(1);
  });

  test('reads the kill switch on every call', async () => {
    useApiKey();
    const fetcher = mock(async () => Response.json({ ...productionPayload, slug: 'toggle' }));
    globalThis.fetch = fetcher;
    process.env.COMPOSIO_TOOLKIT_LIVE_FALLBACK = '0';

    expect(await fetchToolkitFromProduction('toggle')).toBeNull();
    delete process.env.COMPOSIO_TOOLKIT_LIVE_FALLBACK;
    expect(await fetchToolkitFromProduction('toggle')).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('ignores COMPOSIO_API_BASE when building the production URL', async () => {
    useApiKey();
    process.env.COMPOSIO_API_BASE = 'https://staging-backend.composio.dev/api/v3';
    const fetcher = mock(async () => Response.json(productionPayload));
    globalThis.fetch = fetcher;

    await fetchToolkitFromProduction('github');
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://backend.composio.dev/api/v3/toolkits/github');
  });

  test('negative-caches a 404 for 60 seconds, then retries', async () => {
    useApiKey();
    const fetcher = mock(async () => new Response(null, { status: 404 }));
    globalThis.fetch = fetcher;
    const warning = spyOn(console, 'warn').mockImplementation(() => {});
    const now = spyOn(Date, 'now').mockReturnValue(1_000);

    expect(await fetchToolkitFromProduction('cache-miss')).toBeNull();
    expect(await fetchToolkitFromProduction('cache-miss')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);

    now.mockReturnValue(61_001);
    expect(await fetchToolkitFromProduction('cache-miss')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['500 response', async () => new Response(null, { status: 500 })],
    ['network error', async () => Promise.reject(new Error('offline'))],
    ['invalid JSON', async () => new Response('{', { status: 200 })],
  ])('returns null for %s without throwing', async (_label, responseFactory) => {
    useApiKey();
    globalThis.fetch = mock(responseFactory);
    spyOn(console, 'warn').mockImplementation(() => {});

    expect(await fetchToolkitFromProduction(`failure-${_label.replaceAll(' ', '-')}`)).toBeNull();
  });
});
