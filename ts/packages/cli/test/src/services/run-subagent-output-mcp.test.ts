import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('run-subagent-output-mcp source', () => {
  it('[Given] the structured output helper source [Then] it statically imports the MCP SDK', () => {
    const sourcePath = fileURLToPath(
      new URL('../../../src/services/run-subagent-output-mcp.ts', import.meta.url)
    );
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("from '@modelcontextprotocol/sdk/server/mcp.js'");
    expect(source).toContain("from '@modelcontextprotocol/sdk/server/stdio.js'");
    expect(source).toContain("from '@composio/json-schema-to-zod'");
    expect(source).not.toContain("from '@composio/core'");
    expect(source).not.toContain('@modelcontextprotocol/sdk/package.json');
    expect(source).not.toContain('createRequire(import.meta.url)');
  });
});
