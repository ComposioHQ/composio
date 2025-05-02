import { z } from "zod";
import { Composio } from "../sdk";
import {
  RawActionData,
  TPostProcessor,
  TPreProcessor,
  TSchemaProcessor,
  ZExecuteActionParams,
  ZToolSchemaFilter,
} from "../types/base_toolset";
import type { Optional, Sequence } from "../types/util";
import logger from "../utils/logger";
import { getEnvVariable } from "../utils/shared";
import {
  ActionRegistry,
  CreateActionOptions,
  Parameters,
} from "./actionRegistry";
import { ActionExecutionResDto } from "./client/types.gen";
import { ActionExecuteResponse, Actions } from "./models/actions";
import { ActiveTriggers } from "./models/activeTriggers";
import { Apps } from "./models/apps";
import { AxiosBackendClient } from "./models/backendClient";
import { ConnectedAccounts } from "./models/connectedAccounts";
import { Integrations } from "./models/integrations";
import { Triggers } from "./models/triggers";
import { getUserDataJson } from "./utils/config";
import { CEG } from "./utils/error";
import { COMPOSIO_SDK_ERROR_CODES } from "./utils/errors/src/constants";
import {
  FILE_DOWNLOADABLE_PROCESSOR,
  FILE_INPUT_PROCESSOR,
  FILE_SCHEMA_PROCESSOR,
} from "./utils/processor/file";

export type ExecuteActionParams = z.infer<typeof ZExecuteActionParams> & {
  /** @deprecated use actionName field instead */
  action?: string;
  actionName?: string;
};
export class ComposioToolSet {
  client: Composio;
  apiKey: string;
  runtime: string | null;
  entityId: string = "default";
  connectedAccountIds: Record<string, string> = {};

  backendClient: AxiosBackendClient;
  connectedAccounts: ConnectedAccounts;
  apps: Apps;
  actions: Actions;
  triggers: Triggers;
  integrations: Integrations;
  activeTriggers: ActiveTriggers;

  userActionRegistry: ActionRegistry;

  private internalProcessors: {
    pre: TPreProcessor[];
    post: TPostProcessor[];
    schema: TSchemaProcessor[];
  } = {
    pre: [FILE_INPUT_PROCESSOR],
    post: [FILE_DOWNLOADABLE_PROCESSOR],
    schema: [FILE_SCHEMA_PROCESSOR],
  };

  private userDefinedProcessors: {
    pre?: TPreProcessor;
    post?: TPostProcessor;
    schema?: TSchemaProcessor;
  } = {};

  /**
   * Creates a new instance of ComposioToolSet
   * @param {Object} config - Configuration object
   * @param {string|null} config.apiKey - API key for authentication
   * @param {string|null} config.baseUrl - Base URL for API requests
   * @param {string|null} config.runtime - Runtime environment
   * @param {string} config.entityId - Entity ID for operations
   * @param {Record<string, string>} config.connectedAccountIds - Map of app names to their connected account IDs
   * @param {boolean} config.allowTracing - Whether to allow tracing for the SDK
   */
  constructor({
    apiKey,
    baseUrl,
    runtime,
    entityId,
    connectedAccountIds,
    allowTracing,
  }: {
    apiKey?: string | null;
    baseUrl?: string | null;
    runtime?: string | null;
    entityId?: string;
    connectedAccountIds?: Record<string, string>;
    allowTracing?: boolean;
  } = {}) {
    const clientApiKey: string | undefined =
      apiKey ||
      getEnvVariable("COMPOSIO_API_KEY") ||
      (getUserDataJson().api_key as string);
    this.apiKey = clientApiKey;
    this.client = new Composio({
      apiKey: this.apiKey,
      baseUrl: baseUrl || undefined,
      runtime: runtime as string,
      allowTracing: allowTracing || false,
    });

    this.runtime = runtime || null;
    this.backendClient = this.client.backendClient;
    this.connectedAccounts = this.client.connectedAccounts;
    this.apps = this.client.apps;
    this.actions = this.client.actions;
    this.triggers = this.client.triggers;
    this.integrations = this.client.integrations;
    this.activeTriggers = this.client.activeTriggers;
    this.connectedAccountIds = connectedAccountIds || {};

    this.userActionRegistry = new ActionRegistry(this.client);

    if (entityId && connectedAccountIds) {
      logger.warn(
        "When both entity and connectedAccountIds are provided, preference will be given to connectedAccountIds"
      );
    }

    if (connectedAccountIds) {
      this.connectedAccountIds = connectedAccountIds;
    }

    if (entityId) {
      this.entityId = entityId;
    }
  }

  async getActionsSchema(
    filters: { actions?: Optional<Sequence<string>> } = {},
    _entityId?: Optional<string>
  ) {
    return this.getToolsSchema(
      {
        actions: filters.actions || [],
      },
      _entityId
    );
  }

  async getToolsSchema(
    filters: z.infer<typeof ZToolSchemaFilter>,
    _entityId?: Optional<string>,
    _integrationId?: Optional<string>
  ): Promise<RawActionData[]> {
    const parsedFilters = ZToolSchemaFilter.parse(filters);
    let actions = parsedFilters.actions;

    if (_integrationId) {
      const integration = await this.integrations.get({
        integrationId: _integrationId,
      });
      if (integration?.limitedActions) {
        if (!actions) {
          actions = [...integration.limitedActions];
        } else {
          const limitedActionsUppercase = integration.limitedActions.map(
            (action) => action.toUpperCase()
          );
          actions = actions.filter((action) =>
            limitedActionsUppercase.includes(action.toUpperCase())
          );
        }
      }
    }

    const appActions = await this.client.actions.list({
      apps: parsedFilters.apps?.join(","),
      tags: parsedFilters.tags?.join(","),
      useCase: parsedFilters.useCase,
      actions: actions?.join(","),
      usecaseLimit: parsedFilters.useCaseLimit,
      filterByAvailableApps: parsedFilters.filterByAvailableApps,
    });

    const customActions = await this.userActionRegistry.getAllActions();
    const toolsWithCustomActions = customActions.filter((action) => {
      const { name: actionName } = action || {};
      return (
        (!filters.actions ||
          filters.actions.some(
            (name) => name.toLowerCase() === actionName?.toLowerCase()
          )) &&
        (!filters.tags ||
          filters.tags.some((tag) => tag.toLowerCase() === "custom"))
      );
    });

    const toolsActions = [
      ...(appActions?.items || []),
      ...toolsWithCustomActions,
    ];

    const allSchemaProcessor = [
      ...this.internalProcessors.schema,
      ...(this.userDefinedProcessors.schema
        ? [this.userDefinedProcessors.schema]
        : []),
    ];
    const processedTools = [];
    // Iterate over the tools and process them
    for (const tool of toolsActions) {
      let schema = tool as RawActionData;
      // Process the schema with all the processors
      for (const processor of allSchemaProcessor) {
        schema = await processor({
          actionName: schema?.name,
          toolSchema: schema,
        });
      }
      processedTools.push(schema);
    }
    return processedTools;
  }

  async createAction<P extends Parameters = z.ZodObject<{}>>(
    options: CreateActionOptions<P>
  ) {
    return this.userActionRegistry.createAction<P>(options);
  }

  private isCustomAction(action: string) {
    return this.userActionRegistry
      .getActions({ actions: [action] })
      .then((actions) => actions.length > 0);
  }

  async getEntity(entityId: string) {
    return this.client.getEntity(entityId);
  }

  async executeAction(
    functionParams: ExecuteActionParams
  ): Promise<ActionExecuteResponse> {
    const {
      action,
      params: inputParams = {},
      entityId = this.entityId,
      nlaText = "",
      connectedAccountId,
    } = ZExecuteActionParams.parse({
      action: functionParams.actionName || functionParams.action,
      params: functionParams.params,
      entityId: functionParams.entityId,
      nlaText: functionParams.nlaText,
      connectedAccountId: functionParams.connectedAccountId,
    });

    if (!entityId && !connectedAccountId) {
      throw CEG.getCustomError(
        COMPOSIO_SDK_ERROR_CODES.SDK.NO_CONNECTED_ACCOUNT_FOUND,
        {
          message: `No entityId or connectedAccountId provided`,
          description: `Please provide either entityId or connectedAccountId`,
        }
      );
    }

    let params = (inputParams as Record<string, unknown>) || {};

    const allInputProcessor = [
      ...this.internalProcessors.pre,
      ...(this.userDefinedProcessors.pre
        ? [this.userDefinedProcessors.pre]
        : []),
    ];

    for (const processor of allInputProcessor) {
      params = await processor({
        params: params,
        actionName: action,
        client: this.client.backendClient.instance,
      });
    }

    // Custom actions are always executed in the host/local environment for JS SDK
    let accountId = connectedAccountId;
    if (await this.isCustomAction(action)) {
      if (!accountId) {
        const toolName = await this.userActionRegistry.getToolName({ action });
        const connectedAccounts = await this.client.connectedAccounts.list({
          appNames: toolName,
          user_uuid: entityId,
          status: "ACTIVE",
          showActiveOnly: true,
        });
        accountId = connectedAccounts?.items[0]?.id;
      }

      // allows the user to use custom actions and tools without a connected account
      if (!accountId) {
        logger.warn(
          "No connected account found for the user. If your custom action requires a connected account, please double check if you have active accounts connected to it."
        );
      }

      return this.userActionRegistry.executeAction(action, params, {
        entityId: entityId,
        connectionId: accountId,
      });
    }
    const connectedAccountKeys = Object.keys(this.connectedAccountIds);
    if (connectedAccountKeys.length > 0) {
      const actionDetails = await this.actions.get({ actionName: action });
      const appNameKey = connectedAccountKeys.find(
        (key) => key.toLowerCase() === actionDetails.appName
      );
      if (appNameKey) {
        accountId = this.connectedAccountIds[appNameKey];
      }
    }
    const data = await this.client.getEntity(entityId).execute({
      actionName: action,
      params: params,
      text: nlaText,
      connectedAccountId: accountId,
    });

    return this.processResponse(data, {
      action: action,
      entityId: entityId,
    });
  }

  private async processResponse(
    data: ActionExecutionResDto,
    meta: {
      action: string;
      entityId: string;
    }
  ): Promise<ActionExecutionResDto> {
    const allOutputProcessor = [
      ...this.internalProcessors.post,
      ...(this.userDefinedProcessors.post
        ? [this.userDefinedProcessors.post]
        : []),
    ];

    // Dirty way to avoid copy
    let dataToReturn = JSON.parse(JSON.stringify(data));
    for (const processor of allOutputProcessor) {
      dataToReturn = await processor({
        actionName: meta.action,
        toolResponse: dataToReturn,
      });
    }
    return dataToReturn;
  }

  async addSchemaProcessor(processor: TSchemaProcessor) {
    if (typeof processor === "function") {
      this.userDefinedProcessors.schema = processor as TSchemaProcessor;
    } else {
      throw new Error("Invalid processor type");
    }

    return this;
  }

  async addPreProcessor(processor: TPreProcessor) {
    if (typeof processor === "function") {
      this.userDefinedProcessors.pre = processor as unknown as TPreProcessor;
    } else {
      throw new Error("Invalid processor type");
    }

    return this;
  }

  async addPostProcessor(processor: TPostProcessor) {
    if (typeof processor === "function") {
      this.userDefinedProcessors.post = processor as unknown as TPostProcessor;
    } else {
      throw new Error("Invalid processor type");
    }

    return this;
  }

  async removePreProcessor() {
    delete this.userDefinedProcessors.pre;
  }

  async removePostProcessor() {
    delete this.userDefinedProcessors.post;
  }

  async removeSchemaProcessor() {
    delete this.userDefinedProcessors.schema;
  }
}
