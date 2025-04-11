import { ZodObject, ZodOptional, ZodString, z } from "zod";
import { JsonSchema7Type, zodToJsonSchema } from "zod-to-json-schema";
import { Composio } from ".";
import apiClient from "../sdk/client/client";
import { RawActionData } from "../types/base_toolset";
import { ActionProxyRequestConfigDTO, Parameter } from "./client";
import { ActionExecuteResponse } from "./models/actions";
import { CEG } from "./utils/error";
import { COMPOSIO_SDK_ERROR_CODES } from "./utils/errors/src/constants";

type RawExecuteRequestParam = {
  connectedAccountId?: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  parameters: Array<Parameter>;
  body?: {
    [key: string]: unknown;
  };
};

type ValidParameters = ZodObject<{
  [key: string]: ZodString | ZodOptional<ZodString>;
}>;
export type Parameters = ValidParameters | z.ZodObject<{}>;

type inferParameters<PARAMETERS extends Parameters> =
  PARAMETERS extends ValidParameters
    ? z.infer<PARAMETERS>
    : z.infer<z.ZodObject<{}>>;

export type CreateActionOptions<P extends Parameters = z.ZodObject<{}>> = {
  actionName?: string;
  toolName?: string;
  description?: string;
  inputParams?: P;
  callback: (
    inputParams: inferParameters<P>,
    authCredentials: Record<string, string> | undefined,
    executeRequest: (
      data: RawExecuteRequestParam
    ) => Promise<ActionExecuteResponse>
  ) => Promise<ActionExecuteResponse>;
};

interface ParamsSchema {
  definitions: {
    input: {
      properties: Record<string, JsonSchema7Type>;
      required?: string[];
    };
  };
}

interface ExecuteMetadata {
  entityId?: string;
  connectionId?: string;
}

export class ActionRegistry {
  client: Composio;
  customActions: Map<
    string,
    {
      metadata: CreateActionOptions;
      schema: Record<string, unknown>;
    }
  >;

  constructor(client: Composio) {
    this.client = client;
    this.customActions = new Map();
  }

  async createAction<P extends Parameters = z.ZodObject<{}>>(
    options: CreateActionOptions<P>
  ): Promise<RawActionData> {
    const { callback } = options;
    if (typeof callback !== "function") {
      throw new Error("Callback must be a function");
    }
    if (!options.actionName) {
      throw new Error("You must provide actionName for this action");
    }
    if (!options.inputParams) {
      options.inputParams = z.object({}) as P;
    }
    const params = options.inputParams;
    const actionName = options.actionName || callback.name || "";
    const paramsSchema: ParamsSchema = (await zodToJsonSchema(params, {
      name: "input",
    })) as ParamsSchema;
    const _params = paramsSchema.definitions.input.properties;
    const composioSchema = {
      name: actionName,
      description: options.description,
      parameters: {
        title: actionName,
        type: "object",
        description: options.description,
        required: paramsSchema.definitions.input.required || [],
        properties: _params,
      },
      response: {
        type: "object",
        title: "Response for " + actionName,
        properties: [],
      },
    };
    this.customActions.set(options.actionName?.toLocaleLowerCase() || "", {
      metadata: options,
      schema: composioSchema,
    });
    return composioSchema as unknown as RawActionData;
  }

  async getActions({
    actions,
  }: {
    actions: Array<string>;
  }): Promise<Array<RawActionData>> {
    const actionsArr: Array<RawActionData> = [];
    for (const name of actions) {
      const lowerCaseName = name.toLowerCase();
      if (this.customActions.has(lowerCaseName)) {
        const action = this.customActions.get(lowerCaseName);
        actionsArr.push(action!.schema as RawActionData);
      }
    }
    return actionsArr;
  }

  async getAllActions(): Promise<Array<RawActionData>> {
    return Array.from(this.customActions.values()).map(
      (action) => action.schema as RawActionData
    );
  }

  async getToolName({
    action,
  }: {
    action: string;
  }): Promise<string | undefined> {
    if (!action) {
      throw CEG.getCustomError(
        COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED,
        {
          message: "Action name is required",
          description: "Please provide an action name to get its tool name",
        }
      );
    }
    const lowerCaseName = action.toLowerCase();
    return this.customActions.get(lowerCaseName)?.metadata.toolName;
  }

  async executeAction(
    name: string,
    inputParams: Record<string, unknown>,
    metadata: ExecuteMetadata
  ): Promise<ActionExecuteResponse> {
    const lowerCaseName = name.toLocaleLowerCase();
    if (!this.customActions.has(lowerCaseName)) {
      throw new Error(`Action with name ${name} does not exist`);
    }

    const action = this.customActions.get(lowerCaseName);
    if (!action) {
      throw new Error(`Action with name ${name} could not be retrieved`);
    }

    const { callback, toolName } = action.metadata || {};
    let authCredentials = {};
    if (toolName) {
      const entity = await this.client.getEntity(metadata.entityId);
      const connection = await entity.getConnection({
        app: toolName,
        connectedAccountId: metadata.connectionId,
      });
      if (!connection) {
        throw new Error(
          `Connection with app name ${toolName} and entityId ${metadata.entityId} not found`
        );
      }
      const connectionParams = (
        connection as unknown as Record<string, unknown>
      ).connectionParams as Record<string, unknown>;
      authCredentials = {
        headers: connectionParams?.headers,
        queryParams: connectionParams?.queryParams,
        baseUrl: connectionParams?.baseUrl || connectionParams?.base_url,
      };
    }
    if (typeof callback !== "function") {
      throw CEG.getCustomError(
        COMPOSIO_SDK_ERROR_CODES.COMMON.INVALID_PARAMS_PASSED,
        {
          message: "Callback must be a function",
          description: "Please provide a valid callback function",
        }
      );
    }

    const executeRequest = async (data: RawExecuteRequestParam) => {
      try {
        const { data: res } = await apiClient.actionsV2.executeWithHttpClient({
          client: this.client.backendClient.instance,
          body: {
            ...data,
            connectedAccountId: metadata?.connectionId,
          } as ActionProxyRequestConfigDTO,
        });
        return res!;
      } catch (error) {
        throw CEG.handleAllError(error);
      }
    };

    return await callback(
      inputParams as Record<string, string>,
      authCredentials,
      (data: RawExecuteRequestParam) => executeRequest(data)
    );
  }
}
