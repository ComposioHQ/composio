import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getTestConfig } from "../../../config/getTestConfig";
import { RawActionData, TPreProcessor, TPostProcessor, TSchemaProcessor } from "../../types/base_toolset";
import { ComposioToolSet } from "../base.toolset";
import type { ActionExecutionResDto } from "../client";

describe("ComposioToolSet - Processor Management", () => {
  let toolset: ComposioToolSet;
  const testConfig = getTestConfig();

  beforeEach(() => {
    toolset = new ComposioToolSet({
      apiKey: testConfig.COMPOSIO_API_KEY,
      baseUrl: testConfig.BACKEND_HERMES_URL,
      runtime: "composio-ai",
    });
  });

  describe('Schema Processors', () => {
    it('should add and remove schema processor', async () => {
      const processor: TSchemaProcessor = ({ toolSchema }: { toolSchema: RawActionData }): RawActionData => ({
        ...toolSchema,
        description: 'processed',
      });

      await toolset.addSchemaProcessor(processor);
      const tools = await toolset.getToolsSchema({ apps: ['github'] });
      expect(tools[0]?.description).toBe('processed');

      await toolset.removeSchemaProcessor();
      const toolsAfterRemove = await toolset.getToolsSchema({ apps: ['github'] });
      expect(toolsAfterRemove[0]?.description).not.toBe('processed');
    });

    it("should reject invalid processor type", async () => {
      // @ts-ignore - Testing invalid input
      await expect(toolset.addSchemaProcessor("not a function"))
        .rejects.toThrow("Invalid processor type");
    });
  });

  describe('Pre Processors', () => {
    it('should add and remove pre-processor', async () => {
      const processor: TPreProcessor = ({ params }: { params: Record<string, unknown> }): Record<string, unknown> => ({
        ...params,
        processed: true,
      });

      await toolset.addPreProcessor(processor);
      const result = await toolset.executeAction({
        action: 'github_issues_create',
        params: { test: 'value' },
        entityId: 'default',
      });
      expect((result.data as Record<string, boolean>).processed).toBe(true);

      await toolset.removePreProcessor();
    });

    it("should reject invalid processor type", async () => {
      // @ts-ignore - Testing invalid input
      await expect(toolset.addPreProcessor("not a function"))
        .rejects.toThrow("Invalid processor type");
    });
  });

  describe('Post Processors', () => {
    it('should add and remove post-processor', async () => {
      const processor: TPostProcessor = ({ toolResponse }: { toolResponse: ActionExecutionResDto }): ActionExecutionResDto => ({
        ...toolResponse,
        data: { ...toolResponse.data, postProcessed: true },
      });

      await toolset.addPostProcessor(processor);
      const result = await toolset.executeAction({
        action: 'github_issues_create',
        params: {},
        entityId: 'default',
      });
      expect(result.data.postProcessed).toBe(true);

      await toolset.removePostProcessor();
    });

    it("should reject invalid processor type", async () => {
      // @ts-ignore - Testing invalid input
      await expect(toolset.addPostProcessor("not a function"))
        .rejects.toThrow("Invalid processor type");
    });
  });

  describe('Processor Chain', () => {
    it("should execute processors in correct order", async () => {
      const order: string[] = [];
      
      const preProcessor: TPreProcessor = ({ params }) => {
        order.push("pre");
        return { ...params, pre: true };
      };
      
      const postProcessor: TPostProcessor = ({ toolResponse }) => {
        order.push("post");
        return {
          ...toolResponse,
          data: { ...toolResponse.data, post: true },
        };
      };
      
      const schemaProcessor: TSchemaProcessor = ({ toolSchema }) => {
        order.push("schema");
        return {
          ...toolSchema,
          description: "processed by schema",
        };
      };

      await toolset.addPreProcessor(preProcessor);
      await toolset.addPostProcessor(postProcessor);
      await toolset.addSchemaProcessor(schemaProcessor);

      await toolset.executeAction({
        action: "github_issues_create",
        params: {},
        entityId: "default",
      });

      expect(order).toEqual(["schema", "pre", "post"]);

      await toolset.removePreProcessor();
      await toolset.removePostProcessor();
      await toolset.removeSchemaProcessor();
    });

    it("should handle processor errors gracefully", async () => {
      const errorProcessor = jest.fn().mockImplementation(() => {
        throw new Error("Processor error");
      });

      await expect(toolset.addPreProcessor(errorProcessor))
        .rejects.toThrow("Invalid processor type");
    });
  });
});
