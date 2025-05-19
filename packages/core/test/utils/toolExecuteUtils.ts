import { vi, beforeEach } from 'vitest';
import { Tools } from '../../src/models/Tools';
import { mockClient } from './mocks/client.mock';
import { MockToolset } from './mocks/toolset.mock';
import { connectedAccountMocks, toolkitMocks, toolMocks } from './mocks/data.mock';
import ComposioClient from '@composio/client';
import { Tool } from '../../src/types/tool.types';

export type TestTools = Tools<unknown, unknown, MockToolset>;

export interface TestContext {
  tools: TestTools;
  mockToolset: MockToolset;
}

export const createTestContext = (): TestContext => {
  const mockToolset = new MockToolset();
  const tools = new Tools(mockClient as unknown as ComposioClient, mockToolset);
  return { tools, mockToolset };
};

export const setupTest = (context: TestContext) => {
  beforeEach(() => {
    vi.clearAllMocks();
    context.mockToolset = new MockToolset();
    context.tools = new Tools(mockClient as unknown as ComposioClient, context.mockToolset);
  });
};

export const mockToolExecution = async (
  tools: TestTools,
  { customToolExists = false, connectedAccountId = 'test-connected-account-id' } = {}
) => {
  // Mock client responses
  mockClient.tools.retrieve.mockResolvedValueOnce(toolMocks.rawTool);
  mockClient.toolkits.retrieve.mockResolvedValueOnce(toolkitMocks.rawToolkit);
  mockClient.connectedAccounts.list.mockResolvedValueOnce(
    connectedAccountMocks.rawConnectedAccountsResponse
  );

  // Mock custom tool check
  const getCustomToolBySlugSpy = vi.spyOn(tools['customTools'], 'getCustomToolBySlug');
  getCustomToolBySlugSpy.mockResolvedValueOnce(
    customToolExists ? (toolMocks.customTool as unknown as Tool) : undefined
  );

  // Mock composio tool retrieval
  const getComposioToolBySlugSpy = vi.spyOn(tools, 'getComposioToolBySlug');
  getComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as unknown as Tool);

  // Mock connected account
  const getConnectedAccountIdForToolSpy = vi.spyOn(
    tools as unknown as {
      getConnectedAccountIdForTool: (typeof tools)['getConnectedAccountIdForTool'];
    },
    'getConnectedAccountIdForTool'
  );
  getConnectedAccountIdForToolSpy.mockResolvedValueOnce(connectedAccountId);

  // Mock tool execution
  mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);

  return {
    getCustomToolBySlugSpy,
    getComposioToolBySlugSpy,
    getConnectedAccountIdForToolSpy,
  };
};

export type SchemaModification = Partial<Tool> | ((tool: Tool) => Partial<Tool>);

export const createSchemaModifier = (modifications: SchemaModification) => {
  return vi.fn((toolSlug: string, toolkitSlug: string, tool: Tool) => {
    const mods = typeof modifications === 'function' ? modifications(tool) : modifications;
    return {
      ...tool,
      ...mods,
    };
  });
};

export const createExecutionModifiers = ({
  beforeModifications = {},
  afterModifications = {},
} = {}) => {
  return {
    beforeToolExecute: vi.fn((toolSlug: string, toolkitSlug: string, params: any) => ({
      ...params,
      ...beforeModifications,
    })),
    afterToolExecute: vi.fn((toolSlug: string, toolkitSlug: string, response: any) => ({
      ...response,
      ...afterModifications,
    })),
  };
};
