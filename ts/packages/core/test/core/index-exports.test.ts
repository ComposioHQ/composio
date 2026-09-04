import { describe, expect, it } from 'vitest';
import * as core from '../../src';

describe('root exports', () => {
  it('does not export MCP Zod schema values from the root barrel', () => {
    expect(core).toHaveProperty('ConnectionStatus');
    expect(core).not.toHaveProperty('MCPToolkitConfigSchema');
    expect(core).not.toHaveProperty('ComposioMcpRetrieveResponseSchema');
    expect(core).not.toHaveProperty('McpUpdateResponseSchema');
  });
});
