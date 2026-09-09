import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hideDeprecatedFields } from '../../lib/openapi-deprecated';
import { openapi, openapiV3 } from '../../lib/openapi';

describe('docs OpenAPI deprecation filter', () => {
  test('removes fields and their values while preserving the source and legacy operations', () => {
    const schema = {
      type: 'object',
      properties: {
        current: { type: 'string' },
        old: { deprecated: true },
        nested: { type: 'array', items: { properties: { old: { deprecated: true }, keep: {} } } },
        metadata: { type: 'object', additionalProperties: true },
      },
      required: ['current', 'old'],
      default: {
        current: 'yes',
        old: 'no',
        nested: [{ old: 1, keep: 2 }],
        metadata: { deprecated: true },
      },
    };
    const source = {
      paths: {
        '/test': {
          post: {
            deprecated: true,
            requestBody: {
              content: {
                'application/json': {
                  schema,
                  example: schema.default,
                  examples: { named: { value: schema.default } },
                },
              },
            },
          },
        },
      },
    };
    const original = structuredClone(source);
    const result = hideDeprecatedFields(source);
    const media = result.paths['/test'].post.requestBody.content['application/json'];
    const expected = { current: 'yes', nested: [{ keep: 2 }], metadata: { deprecated: true } };
    expect(media.schema.properties).not.toHaveProperty('old');
    expect(media.schema.required).toEqual(['current']);
    expect(media.schema.default).toEqual(expected);
    expect(media.example).toEqual(expected);
    expect(media.examples.named.value).toEqual(expected);
    expect(result.paths['/test'].post.deprecated).toBe(true);
    expect(source).toEqual(original);
    expect(hideDeprecatedFields(result)).toEqual(result);
  });

  test('handles references, aliases, compositions, recursion and boolean schemas', () => {
    const source = {
      components: {
        schemas: {
          'Old/Field': { deprecated: true },
          Alias: { $ref: '#/components/schemas/Old~1Field' },
          Recursive: {
            properties: {
              old: { deprecated: true },
              next: { $ref: '#/components/schemas/Recursive' },
            },
          },
          Composed: {
            allOf: [{ properties: { old: { deprecated: true }, keep: true }, required: ['old'] }],
          },
          Root: {
            properties: {
              alias: { $ref: '#/components/schemas/Alias' },
              retained: { $ref: '#/components/schemas/Alias', deprecated: false },
              recursive: { $ref: '#/components/schemas/Recursive' },
              external: { $ref: 'https://example.com/schema.json' },
              boolean: true,
            },
            default: { alias: 1, retained: 2, recursive: { old: 1, next: { old: 2 } } },
          },
        },
      },
    };
    const result = hideDeprecatedFields(source).components.schemas;
    expect(result.Root.properties).not.toHaveProperty('alias');
    expect(result.Root.properties.retained).toEqual(
      source.components.schemas.Root.properties.retained
    );
    expect(result.Root.properties.external).toEqual(
      source.components.schemas.Root.properties.external
    );
    expect(result.Root.properties.boolean).toBe(true);
    expect(result.Root.default).toEqual({ retained: 2, recursive: { next: {} } });
    expect(result.Recursive.properties).not.toHaveProperty('old');
    expect(result.Composed.allOf[0].properties).toEqual({ keep: true });
    expect(result.Composed.allOf[0].required).toEqual([]);
  });

  test('cleans composed requirements and referenced examples without deleting current union fields', () => {
    const source = {
      components: { examples: { shared: { value: { old: 1, keep: 2 } } } },
      paths: {
        '/test': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    allOf: [{ properties: { old: { deprecated: true }, keep: {} } }],
                    required: ['old', 'keep'],
                  },
                  examples: { sample: { $ref: '#/components/examples/shared' } },
                },
              },
            },
          },
        },
      },
    };
    const result = hideDeprecatedFields(source);
    const media = result.paths['/test'].post.requestBody.content['application/json'];
    expect(media.schema.required).toEqual(['keep']);
    expect(media.examples.sample).toEqual({ value: { keep: 2 } });
    expect(result.components.examples.shared.value).toEqual({ old: 1, keep: 2 });
    const union = {
      components: {
        schemas: {
          Union: {
            oneOf: [{ properties: { field: { deprecated: true } } }, { properties: { field: {} } }],
            default: { field: 'still supported' },
          },
        },
      },
    };
    expect(hideDeprecatedFields(union).components.schemas.Union.default).toEqual({
      field: 'still supported',
    });
  });

  test('does not treat examples or extension values as schema definitions', () => {
    const payload = { schema: { properties: { old: { deprecated: true } } } };
    const source = { example: payload, 'x-custom': payload };
    expect(hideDeprecatedFields(source)).toEqual(source);
  });

  test('filters the actual documents consumed by both schema UI and playground', async () => {
    for (const server of [openapi, openapiV3]) {
      const schemas = await server.getSchemas();
      for (const [path, { bundled }] of Object.entries(schemas)) {
        if (path.endsWith('openapi-webhooks.json')) continue;
        const managed = bundled.components?.schemas?.ComposioManagedAuthConfigCreate;
        expect(managed).toHaveProperty('properties.credentials');
        expect(managed).not.toHaveProperty('properties.tool_access_config');
        expect(managed).not.toHaveProperty('properties.restrict_to_following_tools');
        expect(bundled.components?.schemas?.CustomAuthConfigCreate).not.toHaveProperty(
          'properties.tool_access_config'
        );
        const operation = Object.values(bundled.paths ?? {})
          .flatMap(item => item?.post ?? [])
          .find(
            item =>
              item.operationId === 'postAuthConfigs' || item.operationId === 'postApiV3AuthConfigs'
          );
        expect(operation).toBeDefined();
        expect(JSON.stringify(operation?.requestBody)).not.toContain('restrict_to_following_tools');
      }
    }
    // The downloadable contract remains complete on disk.
    expect(readFileSync(join(process.cwd(), 'public/openapi.json'), 'utf8')).toContain(
      '"restrict_to_following_tools"'
    );
  });
});
