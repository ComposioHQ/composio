import { vi, beforeEach } from 'vitest';
import { Tools } from '../../src/models/Tools';
import { mockClient } from './mocks/client.mock';
import { MockProvider } from './mocks/provider.mock';
import { connectedAccountMocks, toolkitMocks, toolMocks } from './mocks/data.mock';
import ComposioClient from '@composio/client';
import { Tool, ToolExecuteResponse, ToolExecuteParams } from '../../src/types/tool.types';

export type TestTools = Tools<Tool[], Tool, MockProvider>;

export interface TestContext {
  tools: TestTools;
  mockProvider: MockProvider;
}

export const createTestContext = (): TestContext => {
  const mockProvider = new MockProvider();
  const tools = new Tools(mockClient as unknown as ComposioClient, { provider: mockProvider });
  return { tools, mockProvider };
};

export const setupTest = (context: TestContext) => {
  beforeEach(() => {
    vi.clearAllMocks();
    context.mockProvider = new MockProvider();
    context.tools = new Tools(mockClient as unknown as ComposioClient, {
      provider: context.mockProvider,
    });
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
  const getRawComposioToolBySlugSpy = vi.spyOn(tools, 'getRawComposioToolBySlug');
  getRawComposioToolBySlugSpy.mockResolvedValueOnce(toolMocks.transformedTool as unknown as Tool);

  // Mock tool execution
  mockClient.tools.execute.mockResolvedValueOnce(toolMocks.rawToolExecuteResponse);

  return {
    getCustomToolBySlugSpy,
    getRawComposioToolBySlugSpy,
  };
};

export type SchemaModification =
  | Partial<Tool>
  | ((context: { schema: Tool; toolSlug: string; toolkitSlug: string }) => Partial<Tool>);

export const createSchemaModifier = (modifications: SchemaModification) => {
  return vi.fn((context: { schema: Tool; toolSlug: string; toolkitSlug: string }) => {
    const mods = typeof modifications === 'function' ? modifications(context) : modifications;
    return {
      ...context.schema,
      ...mods,
    };
  });
};

export const createExecutionModifiers = ({
  beforeModifications = {},
  afterModifications = {},
} = {}) => {
  return {
    beforeExecute: vi.fn(
      (context: { toolSlug: string; toolkitSlug: string; params: ToolExecuteParams }) => ({
        ...context.params,
        ...beforeModifications,
      })
    ),
    afterExecute: vi.fn(
      (context: { toolSlug: string; toolkitSlug: string; result: ToolExecuteResponse }) => ({
        ...context.result,
        ...afterModifications,
      })
    ),
  };
};
