import {
  z,
  ZodType,
  ZodObject,
  ZodString,
  AnyZodObject,
  ZodOptional,
} from "zod";
import { zodToJsonSchema, JsonSchema7Type } from "zod-to-json-schema";
import { ActionProxyRequestConfigDTO } from "./client";
import { Composio } from ".";
import apiClient from "../sdk/client/client";
import { CEG } from "./utils/error";

type ExecuteRequest = Omit<ActionProxyRequestConfigDTO, "connectedAccountId">;
export type CreateActionOptions = {
  actionName?: string;
  toolName?: string;
  description?: string;
  inputParams: ZodObject<{ [key: string]: ZodString | ZodOptional<ZodString> }>;
  callback: (
    inputParams: Record<string, any>,
    authCredentials: Record<string, any> | undefined,
    executeRequest: (data: ExecuteRequest) => Promise<any>
  ) => Promise<Record<string, any>>;
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
  customActions: Map<string, { metadata: CreateActionOptions; schema: any }>;

  constructor(client: Composio) {
    this.client = client;
    this.customActions = new Map();
  }

  async createAction(
    options: CreateActionOptions
  ): Promise<Record<string, any>> {
    const { callback } = options;
    if (typeof callback !== "function") {
      throw new Error("Callback must be a function");
    }
    if (!options.actionName) {
      throw new Error("You must provide actionName for this action");
    }
    if (!options.inputParams) {
      options.inputParams = z.object({});
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
    return composioSchema;
  }

  async getActions({
    actions,
  }: {
    actions: Array<string>;
  }): Promise<Array<any>> {
    const actionsArr: Array<any> = [];
    for (const name of actions) {
      const lowerCaseName = name.toLowerCase();
      if (this.customActions.has(lowerCaseName)) {
        const action = this.customActions.get(lowerCaseName);
        actionsArr.push(action!.schema);
      }
    }
    return actionsArr;
  }

  async getAllActions(): Promise<Array<any>> {
    return Array.from(this.customActions.values()).map((action: any) => action);
  }

  async executeAction(
    name: string,
    inputParams: Record<string, any>,
    metadata: ExecuteMetadata
  ): Promise<any> {
    const lowerCaseName = name.toLocaleLowerCase();
    if (!this.customActions.has(lowerCaseName)) {
      throw new Error(`Action with name ${name} does not exist`);
    }

    const action = this.customActions.get(lowerCaseName);
    if (!action) {
      throw new Error(`Action with name ${name} could not be retrieved`);
    }

    const { callback, toolName } = action.metadata;
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
      authCredentials = {
        headers: connection.connectionParams?.headers,
        queryParams: connection.connectionParams?.queryParams,
        baseUrl:
          connection.connectionParams?.baseUrl ||
          connection.connectionParams?.base_url,
      };
    }
    if (typeof callback !== "function") {
      throw new Error("Callback must be a function");
    }

    const executeRequest = async (data: ExecuteRequest) => {
      try {
        const { data: res } = await apiClient.actionsV2.executeActionProxyV2({
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
      inputParams,
      authCredentials,
      (data: ExecuteRequest) => executeRequest(data)
    );
  }
}
