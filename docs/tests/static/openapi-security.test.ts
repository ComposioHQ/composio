import { describe, expect, test } from 'bun:test';

import { normalizeNoAuthSecurity } from '../../lib/openapi';

describe('normalizeNoAuthSecurity', () => {
  test('removes the no_auth sentinel without discarding real alternatives', () => {
    const document = {
      paths: {
        '/public': {
          get: {
            security: [{ no_auth: [] }],
          },
        },
        '/mixed': {
          post: {
            security: [{ no_auth: [] }, { bearer: [] }],
          },
        },
      },
    };

    normalizeNoAuthSecurity(document);

    expect(document.paths['/public'].get.security).toEqual([]);
    expect(document.paths['/mixed'].post.security).toEqual([{ bearer: [] }]);
  });
});
