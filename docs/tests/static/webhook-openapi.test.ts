import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { prepareApiSpec, writeWebhookSnapshot } from '../../scripts/fetch-openapi.mjs';

const fixtureDirectories: string[] = [];

function createWebhookSpec() {
  return {
    openapi: '3.1.0',
    tags: [{ name: 'Webhook Events' }],
    webhooks: {
      'composio.test.event': {
        post: {
          operationId: 'composio_test_event',
          tags: ['Webhook Events'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  };
}

function createApiSpec() {
  return {
    openapi: '3.0.0',
    info: { title: 'Fixture', version: '1.0.0' },
    tags: [{ name: 'Public' }, { name: 'x-internal' }],
    paths: {
      '/visible': {
        parameters: [{ name: 'request-id', in: 'header' }],
        get: {
          tags: ['Public', 'Secondary'],
          operationId: 'getV3_1Visible',
          security: [{ CookieAuth: [] }, { ApiKeyAuth: [] }],
          responses: {
            200: {
              content: {
                'application/json': {
                  schema: { nullable: true },
                },
              },
            },
          },
        },
      },
      '/internal': {
        post: {
          tags: ['x-internal'],
          operationId: 'postV3_1Internal',
        },
      },
    },
    components: {
      securitySchemes: {
        CookieAuth: { type: 'apiKey' },
        ApiKeyAuth: { type: 'apiKey' },
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(fixtureDirectories.splice(0).map(path => rm(path, { recursive: true })));
});

describe('webhook OpenAPI snapshot validation', () => {
  test('writes a valid webhook document', async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), 'composio-webhook-openapi-'));
    fixtureDirectories.push(fixtureDir);
    const outputPath = join(fixtureDir, 'openapi-webhooks.json');

    expect(writeWebhookSnapshot(createWebhookSpec(), outputPath)).toBe(true);
    expect(JSON.parse(await readFile(outputPath, 'utf-8'))).toEqual(createWebhookSpec());
  });

  test('keeps the last-good snapshot when a webhook entry is incomplete', async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), 'composio-webhook-openapi-'));
    fixtureDirectories.push(fixtureDir);
    const outputPath = join(fixtureDir, 'openapi-webhooks.json');
    const lastGoodSnapshot = JSON.stringify(createWebhookSpec(), null, 2);
    await writeFile(outputPath, lastGoodSnapshot);

    const warning = spyOn(console, 'warn').mockImplementation(() => {});
    const written = writeWebhookSnapshot(
      {
        openapi: '3.1.0',
        tags: [{ name: 'Webhook Events' }],
        webhooks: { 'composio.test.event': {} },
      },
      outputPath,
      'https://example.com/openapi-webhooks.json'
    );

    expect(written).toBe(false);
    expect(await readFile(outputPath, 'utf-8')).toBe(lastGoodSnapshot);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('webhooks.composio.test.event.post')
    );
    warning.mockRestore();
  });
});

describe('REST OpenAPI processing', () => {
  test('parses, filters, and normalizes without mutating the response', () => {
    const payload = createApiSpec();
    const { spec, removedCount } = prepareApiSpec(payload, '3.1');
    const operation = spec.paths['/visible'].get;

    expect(removedCount).toBe(1);
    expect(Object.keys(spec.paths)).toEqual(['/visible']);
    expect(spec.paths['/visible'].parameters).toEqual(payload.paths['/visible'].parameters);
    expect(operation.tags).toEqual(['Public']);
    expect(operation.operationId).toBe('getVisible');
    expect(operation['x-api-version']).toBe('3.1');
    expect(operation.security).toEqual([{ ApiKeyAuth: [] }]);
    expect(operation.responses[200].content['application/json'].schema.type).toBe('object');
    expect(spec.tags).toEqual([{ name: 'Public' }]);
    expect(spec.components.securitySchemes.CookieAuth).toBeUndefined();
    expect(spec.servers).toEqual([
      {
        url: 'https://backend.composio.dev',
        description: 'PRODUCTION API',
      },
    ]);
    expect(payload.paths['/visible'].get.operationId).toBe('getV3_1Visible');
  });

  test('declares operation tags missing from the top-level tags array', () => {
    const payload = createApiSpec();
    (payload.paths as Record<string, unknown>)['/project/usage/summary'] = {
      post: {
        tags: ['Projects'],
        operationId: 'postProjectUsageSummary',
      },
    };

    const { spec } = prepareApiSpec(payload, '3.1');

    expect(spec.tags).toEqual([{ name: 'Public' }, { name: 'Projects' }]);
  });

  test('keeps the first non-ignored tag from mixed-tag operations', () => {
    const payload = createApiSpec();
    payload.tags.push({ name: 'Admin' });
    (payload.paths as Record<string, unknown>)['/projects'] = {
      get: {
        tags: ['Admin', 'Projects'],
        operationId: 'getProjects',
      },
    };

    const { spec } = prepareApiSpec(payload, '3.1');

    expect(spec.paths['/projects'].get.tags).toEqual(['Projects']);
    expect(spec.tags).toContainEqual({ name: 'Projects' });
    expect(spec.tags).not.toContainEqual({ name: 'Admin' });
  });
});
