/**
 * @fileoverview Custom tools class for Composio SDK, used to manage custom tools created by users.
 *
 * @author Musthaq Ahamad <musthaq@composio.dev>
 * @date 2025-05-05
 * @module CustomTools
 */
import ComposioClient from '@composio/client';
import {
  CustomToolInputParameter,
  CustomToolOptions,
  CustomToolRegistry,
  InputParamsSchema,
} from '../types/customTool.types';
import zodToJsonSchema from 'zod-to-json-schema';
import {
  Tool,
  ToolExecuteParams,
  ToolExecuteResponse,
  ToolList,
  ToolProxyParams,
} from '../types/tool.types';
import logger from '../utils/logger';
import {
  ComposioInvalidExecuteFunctionError,
  ComposioToolNotFoundError,
} from '../errors/ToolErrors';
import { ComposioConnectedAccountNotFoundError } from '../errors/ConnectedAccountsErrors';
import { ComposioError } from '../errors/ComposioError';
import { telemetry } from '../telemetry/Telemetry';
import { ConnectedAccountRetrieveResponse } from '../types/connectedAccounts.types';
import { ValidationError } from '../errors';
import { transformConnectedAccountResponse } from '../utils/transformers/connectedAccounts';
import { ConnectionData } from '../types/connectedAccountAuthStates.types';
import { AuthSchemeTypes } from '../types/authConfigs.types';

export class CustomTools {
  private readonly client: ComposioClient;
  private readonly customToolsRegistry: CustomToolRegistry;

  constructor(client: ComposioClient) {
    if (!client) {
      throw new ComposioError('ComposioClient is required');
    }
    this.client = client;
    this.customToolsRegistry = new Map();
    telemetry.instrument(this, 'CustomTools');
  }

  /**
   * Create a custom tool and registers it in the registry.
   * This is just an in memory registry and is not persisted.
   * @param {CustomToolOptions} toolOptions CustomToolOptions
   * @returns {Tool} The tool created
   *
   * @example
   * ```typescript
   * // Create a custom tool with input parameters
   * const customTool = await composio.customTools.createTool({
   *   name: 'My Custom Tool',
   *   description: 'A tool that performs a custom operation',
   *   slug: 'MY_CUSTOM_TOOL',
   *   inputParams: z.object({
   *     query: z.string().describe('The search query'),
   *     limit: z.number().optional().describe('Maximum number of results')
   *   }),
   *   execute: async (input, connectionConfig, executeToolRequest) => {
   *     // Custom implementation logic
   *     return {
   *       data: { results: ['result1', 'result2'] }
   *     };
   *   }
   * });
   * ```
   */
  async createTool<T extends CustomToolInputParameter>(
    toolOptions: CustomToolOptions<T>
  ): Promise<Tool> {
    const { slug, execute, inputParams, name, description } = toolOptions;
    if (!slug || !execute || !inputParams || !name) {
      throw new Error('Invalid tool options');
    }
    // generate the input parameters schema
    const paramsSchema: InputParamsSchema = zodToJsonSchema(inputParams, {
      name: 'input',
    }) as InputParamsSchema;
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
        properties: {},
      },
      tags: [],
      // this is never set to the user provided toolkitslug so that we can differentiate
      // the toolkitslug is used via the execute function.
      toolkit: { name: 'custom', slug: 'custom' },
    };

    this.customToolsRegistry.set(slug.toLowerCase(), {
      options: toolOptions as unknown as CustomToolOptions<CustomToolInputParameter>,
      schema: toolSchema,
    });
    return toolSchema;
  }

  /**
   * Get all the custom tools from the registry.
   * @param {string[]} param0.toolSlugs The slugs of the tools to get
   * @returns {ToolList} The list of tools
   *
   * @example
   * ```typescript
   * // Get all custom tools
   * const allTools = await composio.customTools.getCustomTools({});
   *
   * // Get specific custom tools by slug
   * const specificTools = await composio.customTools.getCustomTools({
   *   toolSlugs: ['MY_CUSTOM_TOOL', 'ANOTHER_CUSTOM_TOOL']
   * });
   * ```
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
   *
   * @example
   * ```typescript
   * // Get a specific custom tool by its slug
   * const myTool = await composio.customTools.getCustomToolBySlug('MY_CUSTOM_TOOL');
   * if (myTool) {
   *   console.log(`Found tool: ${myTool.name}`);
   * } else {
   *   console.log('Tool not found');
   * }
   * ```
   */
  async getCustomToolBySlug(slug: string): Promise<Tool | undefined> {
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
  private async getConnectedAccountForToolkit(
    toolkitSlug: string,
    userId: string,
    connectedAccountId?: string
  ): Promise<ConnectedAccountRetrieveResponse | null> {
    try {
      await this.client.toolkits.retrieve(toolkitSlug);
      // check if the toolkit is a no auth toolkit
      const toolkit = await this.client.toolkits.retrieve(toolkitSlug);
      const isNoAuthToolkit = toolkit.auth_config_details?.some(
        details => details.mode === AuthSchemeTypes.NO_AUTH
      );
      if (isNoAuthToolkit) {
        return null;
      }
    } catch (error) {
      throw new ComposioToolNotFoundError(`Toolkit with slug ${toolkitSlug} not found`, {
        cause: error,
      });
    }
    const connectedAccounts = await this.client.connectedAccounts.list({
      toolkit_slugs: [toolkitSlug],
      user_ids: [userId],
    });

    if (!connectedAccounts.items.length) {
      throw new ComposioConnectedAccountNotFoundError(
        `No connected accounts found for toolkit ${toolkitSlug}`
      );
    }
    // if a connected account id is provided, use it, otherwise use the first connected account
    const connectedAccount = connectedAccountId
      ? connectedAccounts.items.find(item => item.id === connectedAccountId)
      : connectedAccounts.items[0];

    if (!connectedAccount) {
      throw new ComposioConnectedAccountNotFoundError(
        `Connected account not found for toolkit ${toolkitSlug} for user ${userId}`
      );
    }

    return transformConnectedAccountResponse(connectedAccount);
  }

  /**
   * Execute a custom tool
   *
   * @description If a toolkit is used, the connected account id is used to execute the tool.
   * If a connected account id is provided, it is used to execute the tool.
   * If a connected account id is not provided, the first connected account for the toolkit is used.
   *
   * @param {slug} slug The slug of the tool to execute
   * @param {Record<string, unknown>} inputParams The input parameters for the tool
   * @param {ExecuteMetadata} metadata The metadata of the execution
   * @returns {Promise<ToolExecuteResponse>} The response from the tool
   */
  async executeCustomTool(slug: string, body: ToolExecuteParams): Promise<ToolExecuteResponse> {
    const tool = this.customToolsRegistry.get(slug.toLowerCase());
    if (!tool) {
      throw new ComposioToolNotFoundError(`Tool with slug ${slug} not found`);
    }

    let connectionConfig: ConnectionData | null = null;
    const { toolkitSlug, execute, inputParams } = tool.options;
    // if a toolkit is used, get the connected account, and auth credentials
    let connectedAccountId: string | undefined = body.connectedAccountId;
    // if a toolkit is used, and a userId is provided, get the connected account
    if (toolkitSlug && toolkitSlug !== 'custom' && body.userId) {
      const connectedAccount = await this.getConnectedAccountForToolkit(
        toolkitSlug,
        body.userId,
        body.connectedAccountId
      );
      logger.debug(
        `[CustomTool] Connected account for ${toolkitSlug} found for user ${body.userId}`,
        JSON.stringify(connectedAccount, null, 2)
      );
      if (!connectedAccount) {
        throw new ComposioConnectedAccountNotFoundError(
          `Connected account not found for toolkit ${toolkitSlug} for user ${body.userId}`,
          {
            meta: {
              toolkitSlug,
              userId: body.userId,
            },
          }
        );
      }
      connectionConfig = connectedAccount.state ?? null;
      connectedAccountId = connectedAccount.id;
    }

    if (typeof execute !== 'function') {
      throw new ComposioInvalidExecuteFunctionError('Invalid execute function', {
        meta: {
          toolSlug: slug,
        },
      });
    }
    // create a tool proxy request for users to execute in case of a toolkit being used
    const executeToolRequest = async (data: ToolProxyParams): Promise<ToolExecuteResponse> => {
      // if the toolkit is custom, throw an error while trying to execute the tool by user
      if (toolkitSlug && toolkitSlug === 'custom') {
        throw new ComposioInvalidExecuteFunctionError(
          'Custom tools without a toolkit cannot be executed using the executeToolRequest function',
          {
            possibleFixes: [
              'Please manually execute the tool using your logic.',
              'Pass a toolkit slug to execute the tool on behalf of a toolkit credentials',
            ],
          }
        );
      }
      // map the parameters to the composio format
      const parameters = data.parameters?.map(param => ({
        name: param.name,
        type: param.in,
        value: param.value.toString(),
      }));

      // execute the tool
      const response = await this.client.tools.proxy({
        endpoint: data.endpoint,
        method: data.method,
        parameters: parameters,
        body: data.body,
        connected_account_id: connectedAccountId,
        /**
         * @deprecated
         * @description
         * This parameter is deprecated and will be removed in the future.
         * Please use custom_auth_params instead.
         *
         */
        // @ts-ignore
        custom_connection_data: data.customConnectionData,
      });

      return {
        data: response.data as Record<string, unknown>,
        error: null,
        successful: true,
        logId: undefined,
        sessionInfo: undefined,
      };
    };

    // Parse and validate the input using the tool's schema
    const parsedInput = inputParams.safeParse(body.arguments);
    if (!parsedInput.success) {
      throw new ValidationError('Invalid input parameters', {
        cause: parsedInput.error,
      });
    }

    return execute(parsedInput.data, connectionConfig, executeToolRequest);
  }
}
