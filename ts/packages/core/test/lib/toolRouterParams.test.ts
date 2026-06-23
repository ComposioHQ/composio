import { describe, it, expect } from 'vitest';
import {
  transformToolRouterTagsParams,
  transformToolRouterMultiAccountParams,
  transformToolRouterUpdateParams,
} from '../../src/lib/toolRouterParams';
import { ToolRouterConfigTags } from '../../src/types/toolRouter.types';

describe('transformToolRouterMultiAccountParams', () => {
  it('should return undefined when params is undefined', () => {
    expect(transformToolRouterMultiAccountParams(undefined)).toBeUndefined();
  });

  it('should return undefined when all fields are undefined (empty object)', () => {
    expect(transformToolRouterMultiAccountParams({})).toBeUndefined();
  });

  it('should transform enable only', () => {
    const result = transformToolRouterMultiAccountParams({ enable: true });
    expect(result).toEqual({
      enable: true,
      max_accounts_per_toolkit: undefined,
      require_explicit_selection: true,
    });
  });

  it('should transform all fields', () => {
    const result = transformToolRouterMultiAccountParams({
      enable: true,
      maxAccountsPerToolkit: 3,
      requireExplicitSelection: true,
    });
    expect(result).toEqual({
      enable: true,
      max_accounts_per_toolkit: 3,
      require_explicit_selection: true,
    });
  });

  it('should transform with enable false', () => {
    const result = transformToolRouterMultiAccountParams({ enable: false });
    expect(result).toEqual({
      enable: false,
      max_accounts_per_toolkit: undefined,
      require_explicit_selection: undefined,
    });
  });

  it('should transform maxAccountsPerToolkit only', () => {
    const result = transformToolRouterMultiAccountParams({ maxAccountsPerToolkit: 7 });
    expect(result).toEqual({
      enable: undefined,
      max_accounts_per_toolkit: 7,
      require_explicit_selection: undefined,
    });
  });
});

describe('transformToolRouterTagsParams', () => {
  describe('with undefined input', () => {
    it('should return undefined when params is undefined', () => {
      const result = transformToolRouterTagsParams(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('with array input', () => {
    it('should transform array of tags to enable format', () => {
      const params: ToolRouterConfigTags = ['readOnlyHint', 'idempotentHint'];
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint', 'idempotentHint'],
      });
    });

    it('should handle single tag in array', () => {
      const params: ToolRouterConfigTags = ['readOnlyHint'];
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint'],
      });
    });

    it('should handle all tag types', () => {
      const params: ToolRouterConfigTags = [
        'readOnlyHint',
        'destructiveHint',
        'idempotentHint',
        'openWorldHint',
      ];
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'],
      });
    });

    it('should handle empty array', () => {
      const params: ToolRouterConfigTags = [];
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: [],
      });
    });
  });

  describe('with object input', () => {
    it('should transform object with enable property', () => {
      const params: ToolRouterConfigTags = {
        enable: ['readOnlyHint', 'idempotentHint'],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint', 'idempotentHint'],
      });
    });

    it('should transform object with disable property', () => {
      const params: ToolRouterConfigTags = {
        disable: ['destructiveHint'],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: undefined,
        disable: ['destructiveHint'],
      });
    });

    it('should transform object with both enable and disable properties', () => {
      const params: ToolRouterConfigTags = {
        enable: ['readOnlyHint', 'idempotentHint'],
        disable: ['destructiveHint'],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint', 'idempotentHint'],
        disable: ['destructiveHint'],
      });
    });

    it('should handle object with only enable property', () => {
      const params: ToolRouterConfigTags = {
        enable: ['readOnlyHint'],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint'],
      });
    });

    it('should handle object with only disable property', () => {
      const params: ToolRouterConfigTags = {
        disable: ['destructiveHint', 'openWorldHint'],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: undefined,
        disable: ['destructiveHint', 'openWorldHint'],
      });
    });

    it('should handle empty arrays in object', () => {
      const params: ToolRouterConfigTags = {
        enable: [],
        disable: [],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: [],
        disable: [],
      });
    });
  });
});

describe('transformToolRouterUpdateParams', () => {
  it('should pass through toolkits correctly', () => {
    const result = transformToolRouterUpdateParams({
      toolkits: ['github', 'gmail'],
    });
    expect(result).toEqual({
      toolkits: { enable: ['github', 'gmail'] },
    });
  });

  it('should pass through tools correctly', () => {
    const result = transformToolRouterUpdateParams({
      tools: {
        github: ['GITHUB_CREATE_REPO'],
      },
    });
    expect(result).toEqual({
      tools: {
        github: { enable: ['GITHUB_CREATE_REPO'] },
      },
    });
  });

  it('should pass through tags correctly', () => {
    const result = transformToolRouterUpdateParams({
      tags: ['readOnlyHint'],
    });
    expect(result).toEqual({
      tags: { enable: ['readOnlyHint'] },
    });
  });

  it('should handle null for manageConnections (clearing)', () => {
    const result = transformToolRouterUpdateParams({
      manageConnections: null,
    });
    expect(result).toEqual({
      manage_connections: null,
    });
  });

  it('should handle null for workbench (clearing)', () => {
    const result = transformToolRouterUpdateParams({
      workbench: null,
    });
    expect(result).toEqual({
      workbench: null,
    });
  });

  it('should handle null for multiAccount (clearing)', () => {
    const result = transformToolRouterUpdateParams({
      multiAccount: null,
    });
    expect(result).toEqual({
      multi_account: null,
    });
  });

  it('should only include fields that were explicitly set', () => {
    const result = transformToolRouterUpdateParams({
      toolkits: ['github'],
    });
    // Should only have toolkits, not tools, tags, manage_connections, etc.
    expect(result).toEqual({
      toolkits: { enable: ['github'] },
    });
    expect(result).not.toHaveProperty('tools');
    expect(result).not.toHaveProperty('tags');
    expect(result).not.toHaveProperty('manage_connections');
    expect(result).not.toHaveProperty('workbench');
    expect(result).not.toHaveProperty('multi_account');
    expect(result).not.toHaveProperty('preload');
    expect(result).not.toHaveProperty('auth_configs');
    expect(result).not.toHaveProperty('connected_accounts');
  });

  it('should return empty object when no fields are set', () => {
    const result = transformToolRouterUpdateParams({});
    expect(result).toEqual({});
  });

  it('should NOT apply default enable:true for manageConnections when only callbackUrl is provided', () => {
    const result = transformToolRouterUpdateParams({
      manageConnections: { callbackUrl: 'https://example.com/callback' },
    });
    // Should not have enable: true injected
    expect(result.manage_connections).toBeDefined();
    expect(result.manage_connections).not.toBeNull();
    const mc = result.manage_connections as Record<string, unknown>;
    expect(mc).not.toHaveProperty('enable');
    expect(mc).toHaveProperty('callback_url', 'https://example.com/callback');
  });

  it('should NOT apply default enable:true for workbench when only enableProxyExecution is provided', () => {
    const result = transformToolRouterUpdateParams({
      workbench: { enableProxyExecution: true },
    });
    const wb = result.workbench as Record<string, unknown>;
    expect(wb).not.toHaveProperty('enable');
    expect(wb).toHaveProperty('enable_proxy_execution', true);
  });

  it('should include enable for manageConnections when explicitly set', () => {
    const result = transformToolRouterUpdateParams({
      manageConnections: { enable: false, callbackUrl: 'https://example.com' },
    });
    const mc = result.manage_connections as Record<string, unknown>;
    expect(mc).toHaveProperty('enable', false);
    expect(mc).toHaveProperty('callback_url', 'https://example.com');
  });
});
