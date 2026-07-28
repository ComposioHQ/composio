import { describe, expect, test } from 'bun:test';

import { declareOperationTags } from '../../lib/openapi';

describe('declareOperationTags', () => {
  test('declares operation tags missing from the top-level tags array', () => {
    const document = {
      tags: [{ name: 'Auth', description: 'Auth endpoints' }],
      paths: {
        '/project/usage/summary': {
          post: { tags: ['Projects'] },
        },
        '/auth/session': {
          get: { tags: ['Auth'] },
        },
        '/org/members': {
          get: { tags: ['Organization Management', 'Projects'] },
        },
      },
    };

    declareOperationTags(document);

    expect(document.tags).toEqual([
      { name: 'Auth', description: 'Auth endpoints' },
      { name: 'Projects' },
      { name: 'Organization Management' },
    ]);
  });

  test('covers webhook operations and documents without a tags array', () => {
    const document: {
      tags?: { name: string }[];
      webhooks: Record<string, Record<string, { tags?: string[] }>>;
    } = {
      webhooks: {
        'trigger.fired': {
          post: { tags: ['Webhook Events'] },
        },
      },
    };

    declareOperationTags(document);

    expect(document.tags).toEqual([{ name: 'Webhook Events' }]);
  });

  test('leaves a fully declared document unchanged', () => {
    const tags = [{ name: 'Auth' }];
    const document = {
      tags,
      paths: {
        '/auth/session': {
          get: { tags: ['Auth'] },
        },
      },
    };

    declareOperationTags(document);

    expect(document.tags).toBe(tags);
  });

  test('every shipped spec declares all operation tags', async () => {
    for (const specPath of [
      'public/openapi.json',
      'public/openapi-v3.json',
      'public/openapi-webhooks.json',
    ]) {
      const document = JSON.parse(
        await Bun.file(new URL(`../../${specPath}`, import.meta.url)).text(),
      );
      const declared = new Set(
        (document.tags ?? []).map((tag: { name: string }) => tag.name),
      );
      for (const group of [document.paths, document.webhooks]) {
        for (const pathItem of Object.values(group ?? {})) {
          for (const operation of Object.values(
            pathItem as Record<string, { tags?: string[] } | undefined>,
          )) {
            for (const tag of operation?.tags ?? []) {
              expect(declared.has(tag)).toBe(true);
            }
          }
        }
      }
    }
  });
});
