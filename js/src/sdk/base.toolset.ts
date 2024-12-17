import { Composio } from "../sdk";
import { COMPOSIO_BASE_URL } from "./client/core/OpenAPI";
import type { Optional, Sequence } from "../types/base";
import { getEnvVariable } from "../utils/shared";
import { ActionExecutionResDto } from "./client/types.gen";
import { ActionRegistry, CreateActionOptions } from "./actionRegistry";
import { getUserDataJson } from "./utils/config";
import {
  TPostProcessor,
  TPreProcessor,
  TRawActionData,
  TSchemaProcessor,
  ZExecuteActionParams,
  ZToolSchemaFilter,
} from "../types/base_toolset";
import { z } from "zod";
import {
  fileInputProcessor,
  fileResponseProcessor,
  fileSchemaProcessor,
} from "./utils/processor/file";

export class ComposioToolSet {
  client: Composio;
  apiKey: string;
  runtime: string | null;
  entityId: string;

  userActionRegistry: ActionRegistry;

  private internalProcessors: {
    pre: TPreProcessor[];
    post: TPostProcessor[];
    schema: TSchemaProcessor[];
  } = {
    pre: [fileInputProcessor],
    post: [fileResponseProcessor],
    schema: [fileSchemaProcessor],
  };

  private userDefinedProcessors: {
    pre?: TPreProcessor;
    post?: TPostProcessor;
    schema?: TSchemaProcessor;
  } = {};

  constructor(
    apiKey: string | null,
    baseUrl: string | null = COMPOSIO_BASE_URL,
    runtime: string | null = null,
    _entityId: string = "default"
  ) {
    const clientApiKey: string | undefined =
      apiKey ||
      getEnvVariable("COMPOSIO_API_KEY") ||
      (getUserDataJson().api_key as string);
    this.apiKey = clientApiKey;
    this.client = new Composio(
      this.apiKey,
      baseUrl || undefined,
      runtime as string
    );
    this.userActionRegistry = new ActionRegistry(this.client);
    this.runtime = runtime;
    this.entityId = _entityId;
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
    _entityId?: Optional<string>
  ): Promise<TRawActionData[]> {
    const parsedFilters = ZToolSchemaFilter.parse(filters);

    const apps = await this.client.actions.list({
      apps: parsedFilters.apps?.join(","),
      tags: parsedFilters.tags?.join(","),
      useCase: parsedFilters.useCase,
      actions: parsedFilters.actions?.join(","),
      usecaseLimit: parsedFilters.useCaseLimit,
      filterByAvailableApps: parsedFilters.filterByAvailableApps,
    });

    const toolsWithCustomActions = (
      await this.userActionRegistry.getAllActions()
    ).filter((action) => {
      const { actionName, toolName } = action.metadata;
      return (
        (!filters.actions ||
          filters.actions.some(
            (name) => name.toLowerCase() === actionName!.toLowerCase()
          )) &&
        (!filters.apps ||
          filters.apps.some(
            (name) => name.toLowerCase() === toolName!.toLowerCase()
          )) &&
        (!filters.tags ||
          filters.tags.some((tag) => tag.toLowerCase() === "custom"))
      );
    });

    const toolsActions = [...(apps?.items || []), ...toolsWithCustomActions];

    const allSchemaProcessor = [
      ...this.internalProcessors.schema,
      ...(this.userDefinedProcessors.schema
        ? [this.userDefinedProcessors.schema]
        : []),
    ];

    return toolsActions.map((tool) => {
      let schema = tool as TRawActionData;
      allSchemaProcessor.forEach((processor) => {
        schema = processor({
          actionName: schema?.metadata?.actionName || "",
          appName: schema?.metadata?.toolName || "",
          toolSchema: schema,
        });
      });
      return schema;
    });
  }

  async createAction(options: CreateActionOptions) {
    return this.userActionRegistry.createAction(options);
  }

  private isCustomAction(action: string) {
    return this.userActionRegistry
      .getActions({ actions: [action] })
      .then((actions) => actions.length > 0);
  }

  async executeAction(functionParams: z.infer<typeof ZExecuteActionParams>) {
    const {
      action,
      params: inputParams = {},
      entityId = "default",
      nlaText = "",
      connectedAccountId,
    } = ZExecuteActionParams.parse(functionParams);

    let params = (inputParams as Record<string, unknown>) || {};

    const allInputProcessor = [
      ...this.internalProcessors.pre,
      ...(this.userDefinedProcessors.pre
        ? [this.userDefinedProcessors.pre]
        : []),
    ];

    for (const processor of allInputProcessor) {
      params = processor({
        params: params,
        actionName: action,
        appName: params.app as string,
      });
    }

    // Custom actions are always executed in the host/local environment for JS SDK
    if (await this.isCustomAction(action)) {
      let accountId = connectedAccountId;
      if (!accountId) {
        // fetch connected account id
        const connectedAccounts = await this.client.connectedAccounts.list({
          user_uuid: entityId,
        });
        accountId = connectedAccounts?.items[0]?.id;
      }

      if (!accountId) {
        throw new Error("No connected account found for the user");
      }

      return this.userActionRegistry.executeAction(action, params, {
        entityId: entityId,
        connectionId: accountId,
      });
    }

    const data = (await this.client.getEntity(entityId).execute({
      actionName: action,
      params: params,
      text: nlaText,
    })) as ActionExecutionResDto;

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

    let dataToReturn = { ...data };
    for (const processor of allOutputProcessor) {
      dataToReturn = processor({
        actionName: meta.action,
        appName: "",
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
