import { describe, expect, test } from 'bun:test';

import { sliceApiPageProps, sliceDocumentForPage } from '../../lib/openapi-slice';

// The bail-outs are as important as the per-page narrowing: a larger valid
// payload is safer than a smaller document with dangling references.

const doc = {
  openapi: '3.1.0',
  info: { title: 'API', version: '1' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/users': {
      parameters: [{ name: 'trace', in: 'header' }],
      get: {
        summary: 'List users',
        responses: {
          '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
        },
      },
      post: {
        summary: 'Create user',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUser' } } },
        },
      },
    },
    '/orders': {
      get: {
        summary: 'List orders',
        responses: {
          '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      User: { type: 'object', properties: { address: { $ref: '#/components/schemas/Address' } } },
      Address: { type: 'object', properties: { city: { type: 'string' } } },
      CreateUser: { type: 'object', properties: { name: { type: 'string' } } },
      Order: { type: 'object', properties: { total: { type: 'number' } } },
    },
    securitySchemes: { apiKey: { type: 'apiKey', name: 'x-api-key', in: 'header' } },
  },
};

describe('sliceDocumentForPage', () => {
  test('keeps only the requested operation', () => {
    const out = sliceDocumentForPage(doc, [{ path: '/users', method: 'get' }]);

    expect(Object.keys(out.paths)).toEqual(['/users']);
    expect(Object.keys(out.paths['/users'])).toContain('get');
    expect(Object.keys(out.paths['/users'])).not.toContain('post');
  });

  test('carries shared path-item keys along with the operation', () => {
    const out = sliceDocumentForPage(doc, [{ path: '/users', method: 'get' }]);

    expect(out.paths['/users'].parameters).toEqual([{ name: 'trace', in: 'header' }]);
  });

  test('keeps transitively reachable components and drops the rest', () => {
    const out = sliceDocumentForPage(doc, [{ path: '/users', method: 'get' }]);

    // User -> Address must survive; unrelated schemas must not.
    expect(Object.keys(out.components.schemas).sort()).toEqual(['Address', 'User']);
  });

  test('always keeps securitySchemes, which are referenced by name', () => {
    const out = sliceDocumentForPage(doc, [{ path: '/users', method: 'get' }]);

    expect(out.components.securitySchemes).toEqual(doc.components.securitySchemes);
  });

  test('preserves top-level document metadata', () => {
    const out = sliceDocumentForPage(doc, [{ path: '/users', method: 'get' }]);

    expect(out.openapi).toBe('3.1.0');
    expect(out.info).toEqual(doc.info);
    expect(out.servers).toEqual(doc.servers);
  });

  test('supports a page rendering several operations', () => {
    const out = sliceDocumentForPage(doc, [
      { path: '/users', method: 'get' },
      { path: '/orders', method: 'get' },
    ]);

    expect(Object.keys(out.paths).sort()).toEqual(['/orders', '/users']);
    expect(Object.keys(out.components.schemas).sort()).toEqual(['Address', 'Order', 'User']);
  });

  test('does not mutate the source document', () => {
    sliceDocumentForPage(doc, [{ path: '/users', method: 'get' }]);

    expect(Object.keys(doc.paths).sort()).toEqual(['/orders', '/users']);
    expect(Object.keys(doc.components.schemas).sort()).toEqual([
      'Address',
      'CreateUser',
      'Order',
      'User',
    ]);
  });

  test('slices webhook pages', () => {
    const withWebhook = {
      ...doc,
      webhooks: {
        userCreated: {
          post: {
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
            },
          },
        },
        ignored: { post: { summary: 'other' } },
      },
    };

    const out = sliceDocumentForPage(withWebhook, [], [{ name: 'userCreated', method: 'post' }]);

    expect(Object.keys(out.webhooks)).toEqual(['userCreated']);
    expect(Object.keys(out.components.schemas).sort()).toEqual(['Address', 'User']);
  });

  test('keeps the whole document when nothing is requested', () => {
    expect(sliceDocumentForPage(doc, [], [])).toBe(doc);
  });

  test('keeps the whole document for a reference outside components', () => {
    const odd = {
      ...doc,
      paths: {
        '/users': {
          get: { responses: { '200': { $ref: '#/paths/~1orders/get' } } },
        },
      },
    };

    expect(sliceDocumentForPage(odd, [{ path: '/users', method: 'get' }])).toBe(odd);
  });

  test('keeps the whole document for a deep component reference', () => {
    const deep = {
      ...doc,
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                $ref: '#/components/schemas/User/properties/address',
              },
            },
          },
        },
      },
    };

    expect(sliceDocumentForPage(deep, [{ path: '/users', method: 'get' }])).toBe(deep);
  });

  test('supports escaped slashes in component names', () => {
    const escaped = {
      ...doc,
      paths: {
        '/users': {
          get: {
            responses: {
              '200': { $ref: '#/components/schemas/a~1b' },
            },
          },
        },
      },
      components: {
        ...doc.components,
        schemas: {
          ...doc.components.schemas,
          'a/b': { type: 'string' },
        },
      },
    };

    const out = sliceDocumentForPage(escaped, [{ path: '/users', method: 'get' }]);

    expect(out).not.toBe(escaped);
    expect(out.components.schemas).toEqual({
      'a/b': { type: 'string' },
    });
  });

  test('keeps the whole document for a dangling component reference', () => {
    const dangling = {
      ...doc,
      paths: { '/users': { get: { responses: { '200': { $ref: '#/components/schemas/Missing' } } } } },
    };

    expect(sliceDocumentForPage(dangling, [{ path: '/users', method: 'get' }])).toBe(dangling);
  });

  test('keeps the whole document when the operation is absent', () => {
    expect(sliceDocumentForPage(doc, [{ path: '/nope', method: 'get' }])).toBe(doc);
    expect(sliceDocumentForPage(doc, [{ path: '/users', method: 'delete' }])).toBe(doc);
  });

  test('leaves external references alone', () => {
    const external = {
      ...doc,
      paths: {
        '/users': { get: { responses: { '200': { $ref: 'https://example.com/s.json#/User' } } } },
      },
    };

    const out = sliceDocumentForPage(external, [{ path: '/users', method: 'get' }]);

    expect(out.paths['/users'].get.responses['200']).toEqual({
      $ref: 'https://example.com/s.json#/User',
    });
  });
});

describe('sliceApiPageProps', () => {
  test('narrows payload.bundled while preserving other props', () => {
    const props = {
      payload: { bundled: doc, proxyUrl: '/api/proxy' },
      operations: [{ path: '/users', method: 'get' }],
      hasHead: true,
    };

    const out = sliceApiPageProps(props);

    expect(Object.keys(out.payload.bundled.paths)).toEqual(['/users']);
    expect(out.payload.proxyUrl).toBe('/api/proxy');
    expect(out.hasHead).toBe(true);
    expect(out.operations).toBe(props.operations);
  });

  test('passes through props without a bundled payload', () => {
    const preloaded = { document: 'openapi.json', preloaded: { docs: {} } };

    expect(sliceApiPageProps(preloaded)).toBe(preloaded);
  });
});
