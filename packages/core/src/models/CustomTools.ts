/**
 * @fileoverview Custom tools class for Composio SDK, used to manage custom tools created by users.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module CustomTools
 */
import ComposioClient from '@composio/client';
import {
  CustomToolInput,
  CustomToolInputParameter,
  CustomToolOptions,
  CustomToolRegistry,
  ExecuteMetadata,
  InputParamsSchema,
} from '../types/customTool.types';
import zodToJsonSchema from 'zod-to-json-schema';
import { Tool, ToolExecuteResponse, ToolList } from '../types/tool.types';
import { ToolProxyParams } from '@composio/client/resources/tools';
import logger from '../utils/logger';
import {
  ComposioInvalidExecuteFunctionError,
  ComposioToolNotFoundError,
} from '../errors/ToolErrors';
import { ComposioConnectedAccountNotFoundError } from '../errors/ConnectedAccountsError';
import { ComposioError } from '../errors/ComposioError';

export class CustomTools {
  private readonly client: ComposioClient;
  private readonly customToolsRegistry: CustomToolRegistry;

  constructor(client: ComposioClient) {
    if (!client) {
      throw new ComposioError('ComposioClient is required');
    }
    this.client = client;
    this.customToolsRegistry = new Map();
  }

  /**
   * Create a custom tool and registers it in the registry.
   * This is just an in memory registry and is not persisted.
   * @param {CustomToolOptions} toolOptions CustomToolOptions
   * @returns {Tool} The tool created
   */
  async createTool(toolOptions: CustomToolOptions): Promise<Tool> {
    const { slug, execute, inputParams, name, description } = toolOptions;
    if (!slug || !execute || !inputParams || !name) {
      throw new Error('Invalid tool options');
    }
    // generate the input parameters schema
    const paramsSchema: InputParamsSchema = (await zodToJsonSchema(inputParams, {
      name: 'input',
    })) as InputParamsSchema;
    const paramsSchemaJson = paramsSchema.definitions.input;
    const toolSchema: Tool = {
      name: name,
      slug: slug,
      description: description,
      inputParameters: {
        title: name,
        type: 'object',
        description: description,
        properties: paramsSchemaJson.properties,
        required: paramsSchemaJson.required,
      },
      // the output parameters are not used yet
      outputParameters: {
        type: 'object',
        title: `Response for ${name}`,
        properties: [],
      },
      tags: [],
      toolkit: { name: 'custom', slug: 'custom' },
    };

    this.customToolsRegistry.set(slug.toLowerCase(), {
      options: toolOptions,
      schema: toolSchema,
    });
    return toolSchema;
  }

  /**
   * Get all the custom tools from the registry.
   * @param {string[]} param0.toolSlugs The slugs of the tools to get
   * @returns {ToolList} The list of tools
   */
  async getCustomTools({ toolSlugs }: { toolSlugs?: string[] }): Promise<ToolList> {
    const tools: Tool[] = [];

    if (toolSlugs) {
      // If specific slugs are provided, only return those tools
      for (const slug of toolSlugs) {
        const tool = this.customToolsRegistry.get(slug.toLowerCase());
        if (tool) {
          tools.push(tool.schema);
        }
      }
    } else {
      // If no slugs provided, return all tools
      return Array.from(this.customToolsRegistry.values()).map(tool => tool.schema);
    }

    return tools;
  }

  /**
   * Get a custom tool by slug from the registry.
   * @param {string} slug The slug of the tool to get
   * @returns {Tool} The tool
   */
  async getCustomToolBySlug(slug: string): Promise<Tool | undefined> {
    if (!slug) {
      throw new Error('Tool slug is required');
    }

    try {
      const tool = this.customToolsRegistry.get(slug.toLowerCase());
      return tool?.schema;
    } catch (error) {
      logger.error(`Error getting custom tool: ${error}`);
      return undefined;
    }
  }

  /**
   * Get the connected account for the user and toolkit.
   * @param {string} toolkitSlug The slug of the toolkit
   * @param {ExecuteMetadata} metadata The metadata of the execution
   * @returns {ConnectedAccount} The connected account
   */
  private async getConnectedAccount(toolkitSlug: string, metadata: ExecuteMetadata) {
    try {
      await this.client.toolkits.retrieve(toolkitSlug);
    } catch (error) {
      throw new ComposioToolNotFoundError(`Toolkit with slug ${toolkitSlug} not found`, {
        toolkitSlug,
        error,
      });
    }
    const connectedAccounts = await this.client.connectedAccounts.list({
      toolkit_slugs: [toolkitSlug],
      user_ids: [metadata.userId],
    });

    if (!connectedAccounts.items.length) {
      throw new ComposioConnectedAccountNotFoundError(
        `No connected accounts found for toolkit ${toolkitSlug}`,
        {
          toolkitSlug,
        }
      );
    }

    return metadata.connectedAccountId
      ? connectedAccounts.items.find(item => item.id === metadata.connectedAccountId)
      : connectedAccounts.items[0];
  }

  /**
   * Execute a custom tool
   * @param {slug} slug The slug of the tool to execute
   * @param {Record<string, unknown>} inputParams The input parameters for the tool
   * @param {ExecuteMetadata} metadata The metadata of the execution
   * @returns {Promise<ToolExecuteResponse>} The response from the tool
   */
  async executeCustomTool(
    slug: string,
    inputParams: Record<string, unknown>,
    metadata: ExecuteMetadata
  ): Promise<ToolExecuteResponse> {
    const tool = this.customToolsRegistry.get(slug.toLowerCase());
    if (!tool) {
      throw new ComposioToolNotFoundError(`Tool with slug ${slug} not found`, {
        toolSlug: slug,
      });
    }

    let authCredentials: Record<string, unknown> = {};
    const { toolkitSlug, execute } = tool.options;
    // if a toolkit is used, get the connected account, and auth credentials
    if (toolkitSlug && toolkitSlug !== 'custom') {
      const connectedAccount = await this.getConnectedAccount(toolkitSlug, metadata);
      if (!connectedAccount) {
        throw new ComposioConnectedAccountNotFoundError(
          `Connected account not found for toolkit ${toolkitSlug} for user ${metadata.userId}`,
          {
            toolkitSlug,
            userId: metadata.userId,
          }
        );
      }
      authCredentials = connectedAccount.data?.connectionParams as Record<string, unknown>;
    }

    if (typeof execute !== 'function') {
      throw new ComposioInvalidExecuteFunctionError('Invalid execute function', {
        toolSlug: slug,
      });
    }
    // create a tool proxy request for users to execute in case of a toolkit being used
    const executeToolRequest = async (data: ToolProxyParams) => {
      return this.client.tools.proxy({
        ...data,
        connected_account_id: metadata.connectedAccountId,
      });
    };

    return execute(
      inputParams as CustomToolInput<CustomToolInputParameter>,
      authCredentials,
      executeToolRequest
    );
  }
}
