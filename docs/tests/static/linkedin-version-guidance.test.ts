import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const documents = [
  readFileSync(join(process.cwd(), 'kb/articles/toolkits-linkedin.md'), 'utf8'),
  readFileSync(join(process.cwd(), 'content/kb/guide/toolkits-linkedin.mdx'), 'utf8'),
];

describe('LinkedIn version troubleshooting', () => {
  test('documents the REST execute override for retired LinkedIn API versions', () => {
    for (const document of documents) {
      expect(document).toContain('POST https://backend.composio.dev/api/v3/tools/execute/');
      expect(document).toContain('"version": "latest"');
      expect(document).toContain('/api/v3.1/tools/execute/');
      expect(document).toContain('426 `NONEXISTENT_VERSION`');
    }
  });
});
