import { z, ZodType, ZodObject, ZodString, AnyZodObject, ZodOptional } from "zod";
import { zodToJsonSchema, JsonSchema7Type } from "zod-to-json-schema";
import { Composio } from ".";

export interface CreateActionOptions {
    actionName?: string;
    toolName?: string;
    description?: string;
    params: ZodObject<{ [key: string]: ZodString | ZodOptional<ZodString> }>;
    callback: (params: Record<string, any>) => Promise<Record<string, any>>;
}

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
    customActions: Map<string, { schema: any; metadata: CreateActionOptions, composioSchema: any }>;

    constructor(client: Composio) {
        this.client = client;
        this.customActions = new Map();
    }

    async createAction(options: CreateActionOptions): Promise<Record<string, any>> {
        const { callback, params } = options;
        if (typeof callback !== "function") {
            throw new Error("Callback must be a function");
        }
        if (!options.actionName) {
            throw new Error("You must provide actionName for this action");
        }
        const actionName = options.actionName  || callback.name || '';
        const paramsSchema: ParamsSchema = await zodToJsonSchema(
            params,
            {
                name: "input",
            }
        ) as ParamsSchema;
        const _params = paramsSchema.definitions.input.properties;
        this.customActions.set(options.actionName?.toLocaleLowerCase() || '', { schema: paramsSchema, metadata: options,
            composioSchema: {
                title: actionName,
                type: "object",
                description: options.description,
                required: paramsSchema.definitions.input.required || [],
                properties: _params,
            }
         });
        return {
            title: actionName,
            type: "object",
            description: options.description,
            required: paramsSchema.definitions.input.required || [],
            properties: _params,
        };
    }

    async getActions({actions}: {actions: Array<string>}): Promise<Array<any>> {
        const actionsArr: Array<any> = [];
        for (const name of actions) {
            const lowerCaseName = name.toLowerCase();
            if (this.customActions.has(lowerCaseName)) {
                const action = this.customActions.get(lowerCaseName);
                actionsArr.push(action!.composioSchema);
            }
        }
        return actionsArr;
    }

    async getAllActions(): Promise<Array<any>> {
        return Array.from(this.customActions.values()).map((action: any) => action.composioSchema);
    }

    async executeAction(name: string, params: Record<string, any>, metadata: ExecuteMetadata): Promise<any> {
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
            const connection = await entity.getConnection(toolName, metadata.connectionId);
            if(!connection) {
                throw new Error(`Connection with name ${toolName} and entityId ${metadata.entityId} not found`);
            }
            authCredentials = {
                headers: connection.connectionParams?.headers,
                queryParams: connection.connectionParams?.queryParams,
                baseUrl: connection.connectionParams?.baseUrl,
            }
        }
        if (typeof callback !== "function") {
            throw new Error("Callback must be a function");
        }

        return await callback(params);
    }
}
