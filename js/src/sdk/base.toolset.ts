import { Composio } from "../sdk";
import { ExecEnv, WorkspaceFactory } from "../env/factory";
import { COMPOSIO_BASE_URL } from "./client/core/OpenAPI";
import { RemoteWorkspace } from "../env/base";
import type { IPythonActionDetails, Optional, Sequence } from "./types";
import { getEnvVariable } from "../utils/shared";
import { WorkspaceConfig } from "../env/config";
import { Workspace } from "../env";
import { ActionExecutionResDto } from "./client/types.gen";
import { saveFile } from "./utils/fileUtils";
import { convertReqParams, converReqParamForActionExecution } from "./utils";
import { ActionRegistry, CreateActionOptions } from "./actionRegistry";
import { getUserDataJson } from "./utils/config";
import { z } from "zod";
type GetListActionsResponse = {
  items: any[];
};

const ZExecuteActionParams = z.object({
  action: z.string(),
  params: z.record(z.any()).optional(),
  entityId: z.string(),
  nlaText: z.string().optional(),
  connectedAccountId: z.string().optional(),
  config: z
    .object({
      labels: z.array(z.string()).optional(),
    })
    .optional(),
});

type TPreProcessor = ({
  action,
  toolRequest,
}: {
  action: string;
  toolRequest: Record<string, unknown>;
}) => Record<string, unknown>;
type TPostProcessor = ({
  action,
  toolResponse,
}: {
  action: string;
  toolResponse: ActionExecutionResDto;
}) => ActionExecutionResDto;

const fileProcessor = ({
  action,
  toolResponse,
}: {
  action: string;
  toolResponse: ActionExecutionResDto;
}): ActionExecutionResDto => {
  // @ts-expect-error
  const isFile = !!toolResponse.data.response_data.file as boolean;

  if (!isFile) {
    return toolResponse;
  }

  // @ts-expect-error
  const fileData = toolResponse.data.response_data.file;
  const { name, content } = fileData as { name: string; content: string };
  const file_name_prefix = `${action}_${Date.now()}`;
  const filePath = saveFile(file_name_prefix, content, true);

  // @ts-ignore
  delete toolResponse.data.response_data.file;

  return {
    error: toolResponse.error,
    successfull: toolResponse.successfull,
    data: {
      ...toolResponse.data,
      file_uri_path: filePath,
    },
  };
};

export class ComposioToolSet {
  client: Composio;
  apiKey: string;
  runtime: string | null;
  entityId: string;
  workspace: WorkspaceFactory;
  workspaceEnv: ExecEnv;

  localActions: IPythonActionDetails["data"] | undefined;
  customActionRegistry: ActionRegistry;

  private processors: {
    pre?: TPreProcessor;
    post?: TPostProcessor;
  } = {};

  constructor(
    apiKey: string | null,
    baseUrl: string | null = COMPOSIO_BASE_URL,
    runtime: string | null = null,
    entityId: string = "default",
    workspaceConfig: WorkspaceConfig = Workspace.Host()
  ) {
    const clientApiKey: string | undefined =
      apiKey ||
      getEnvVariable("COMPOSIO_API_KEY") ||
      (getUserDataJson().api_key as string);
    this.apiKey = clientApiKey;
    this.client = new Composio({
      apiKey: this.apiKey,
      baseUrl: baseUrl as string,
      runtime: runtime as string,
    });
    this.customActionRegistry = new ActionRegistry(this.client);
    this.runtime = runtime;
    this.entityId = entityId;

    if (!workspaceConfig.config.composioBaseURL) {
      workspaceConfig.config.composioBaseURL = baseUrl;
    }
    if (!workspaceConfig.config.composioAPIKey) {
      workspaceConfig.config.composioAPIKey = apiKey;
    }
    this.workspace = new WorkspaceFactory(workspaceConfig.env, workspaceConfig);
    this.workspaceEnv = workspaceConfig.env;

    if (typeof process !== "undefined") {
      process.on("exit", async () => {
        await this.workspace.workspace?.teardown();
      });
    }
  }

  /**
   * @deprecated This method is deprecated. Please use this.client.getExpectedParamsForUser instead.
   */
  async getExpectedParamsForUser(
    params: {
      app?: string;
      integrationId?: string;
      entityId?: string;
      authScheme?:
        | "OAUTH2"
        | "OAUTH1"
        | "API_KEY"
        | "BASIC"
        | "BEARER_TOKEN"
        | "BASIC_WITH_JWT";
    } = {}
  ) {
    return this.client.getExpectedParamsForUser(params);
  }

  async setup() {
    await this.workspace.new();

    if (!this.localActions && this.workspaceEnv !== ExecEnv.HOST) {
      this.localActions = await (
        this.workspace.workspace as RemoteWorkspace
      ).getLocalActionsSchema();
    }
  }

  async getActionsSchema(
    filters: { actions?: Optional<Sequence<string>> } = {},
    entityId?: Optional<string>
  ): Promise<Sequence<NonNullable<GetListActionsResponse["items"]>[0]>> {
    await this.setup();
    const actions = (
      await this.client.actions.list({
        actions: filters.actions?.join(","),
        showAll: true,
      })
    ).items;
    const localActionsMap = new Map<
      string,
      NonNullable<GetListActionsResponse["items"]>[0]
    >();
    filters.actions?.forEach((action: string) => {
      const actionData = this.localActions?.find((a: any) => a.name === action);
      if (actionData) {
        localActionsMap.set(actionData.name!, actionData);
      }
    });
    const uniqueLocalActions = Array.from(localActionsMap.values());
    const _newActions = filters.actions?.map((action: string) =>
      action.toLowerCase()
    );
    const toolsWithCustomActions = (
      await this.customActionRegistry.getActions({ actions: _newActions! })
    ).filter((action) => {
      if (
        _newActions &&
        !_newActions.includes(action.parameters.title.toLowerCase()!)
      ) {
        return false;
      }
      return true;
    });

    const toolsActions = [
      ...actions!,
      ...uniqueLocalActions,
      ...toolsWithCustomActions,
    ];

    return toolsActions.map((action) => {
      return this.modifyActionForLocalExecution(action);
    });
  }

  /**
   * @deprecated This method is deprecated. Please use this.client.connectedAccounts.getAuthParams instead.
   */
  async getAuthParams(data: { connectedAccountId: string }) {
    return this.client.connectedAccounts.getAuthParams({
      connectedAccountId: data.connectedAccountId,
    });
  }

  async getTools(
    filters: {
      apps: Sequence<string>;
      tags?: Optional<Array<string>>;
      useCase?: Optional<string>;
    },
    entityId?: Optional<string>
  ): Promise<unknown> {
    throw new Error("Not implemented. Please define in extended toolset");
  }

  async getToolsSchema(
    filters: {
      actions?: Optional<Array<string>>;
      apps?: Array<string>;
      tags?: Optional<Array<string>>;
      useCase?: Optional<string>;
      useCaseLimit?: Optional<number>;
      filterByAvailableApps?: Optional<boolean>;
    },
    entityId?: Optional<string>
  ): Promise<Sequence<NonNullable<GetListActionsResponse["items"]>[0]>> {
    await this.setup();

    const apps = await this.client.actions.list({
      ...(filters?.apps && { apps: filters?.apps?.join(",") }),
      ...(filters?.tags && { tags: filters?.tags?.join(",") }),
      ...(filters?.useCase && { useCase: filters?.useCase }),
      ...(filters?.actions && { actions: filters?.actions?.join(",") }),
      ...(filters?.useCaseLimit && { usecaseLimit: filters?.useCaseLimit }),
      filterByAvailableApps: filters?.filterByAvailableApps ?? undefined,
    });
    const localActions = new Map<
      string,
      NonNullable<GetListActionsResponse["items"]>[0]
    >();
    if (filters.apps && Array.isArray(filters.apps)) {
      for (const appName of filters.apps!) {
        const actionData = this.localActions?.filter(
          (a: { appName: string }) => a.appName === appName
        );
        if (actionData) {
          for (const action of actionData) {
            localActions.set(action.name, action);
          }
        }
      }
    }
    const uniqueLocalActions = Array.from(localActions.values());

    const toolsWithCustomActions = (
      await this.customActionRegistry.getAllActions()
    )
      .filter((action) => {
        if (
          filters.actions &&
          !filters.actions.some(
            (actionName) =>
              actionName.toLowerCase() ===
              action.metadata.actionName!.toLowerCase()
          )
        ) {
          return false;
        }
        if (
          filters.apps &&
          !filters.apps.some(
            (appName) =>
              appName.toLowerCase() === action.metadata.toolName!.toLowerCase()
          )
        ) {
          return false;
        }
        if (
          filters.tags &&
          !filters.tags.some(
            (tag) => tag.toLocaleLowerCase() === "custom".toLocaleLowerCase()
          )
        ) {
          return false;
        }
        return true;
      })
      .map((action) => {
        return action.schema;
      });

    const toolsActions = [
      ...apps?.items!,
      ...uniqueLocalActions,
      ...toolsWithCustomActions,
    ];

    return toolsActions.map((action) => {
      return this.modifyActionForLocalExecution(action);
    });
  }

  modifyActionForLocalExecution(toolSchema: any) {
    const properties = convertReqParams(toolSchema.parameters.properties);
    toolSchema.parameters.properties = properties;
    const response = toolSchema.response.properties;

    for (const responseKey of Object.keys(response)) {
      if (responseKey === "file") {
        response["file_uri_path"] = {
          type: "string",
          title: "Name",
          description:
            "Local absolute path to the file or http url to the file",
        };

        delete response[responseKey];
      }
    }

    return toolSchema;
  }

  async createAction(options: CreateActionOptions) {
    return this.customActionRegistry.createAction(options);
  }

  private isCustomAction(action: string) {
    return this.customActionRegistry
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
    let params = inputParams;

    const isPreProcessorAndIsFunction =
      typeof this?.processors?.pre === "function";
    if (isPreProcessorAndIsFunction && this.processors.pre) {
      params = this.processors.pre({
        action: action,
        toolRequest: params,
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

      return this.customActionRegistry.executeAction(action, params, {
        entityId: entityId,
        connectionId: accountId,
      });
    }
    if (this.workspaceEnv && this.workspaceEnv !== ExecEnv.HOST) {
      const workspace = await this.workspace.get();
      return workspace.executeAction(action, params, {
        entityId: this.entityId,
      });
    }
    const convertedParams = await converReqParamForActionExecution(params);
    const data = (await this.client.getEntity(entityId).execute({
      actionName: action,
      params: convertedParams,
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
    let dataToReturn = { ...data };
    // @ts-ignore
    const isFile = !!data?.response_data?.file;
    if (isFile) {
      dataToReturn = fileProcessor({
        action: meta.action,
        toolResponse: dataToReturn,
      }) as ActionExecutionResDto;
    }

    const isPostProcessorAndIsFunction =
      !!this.processors.post && typeof this.processors.post === "function";
    if (isPostProcessorAndIsFunction && this.processors.post) {
      dataToReturn = this.processors.post({
        action: meta.action,
        toolResponse: dataToReturn,
      });
    }

    return dataToReturn;
  }

  async addPreProcessor(processor: TPreProcessor) {
    if (typeof processor === "function") {
      this.processors.pre = processor as TPreProcessor;
    } else {
      throw new Error("Invalid processor type");
    }
  }

  async addPostProcessor(processor: TPostProcessor) {
    if (typeof processor === "function") {
      this.processors.post = processor as TPostProcessor;
    } else {
      throw new Error("Invalid processor type");
    }
  }

  async removePreProcessor() {
    delete this.processors.pre;
  }

  async removePostProcessor() {
    delete this.processors.post;
  }
}
