import { BaseComposioToolset, Composio, Tool, jsonSchemaToModel } from "@composio/core"
import { LangchainToolset } from "@composio/langchain"
import { DynamicStructuredTool } from "@langchain/core/tools"
import process from "process"

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new LangchainToolset()
})

// direct tool access
const tools = await composio.getTools()

class MyToolSet extends BaseComposioToolset<typeof tools, typeof tools[number]> {
  readonly FILE_NAME = "examples/langchain/src/index.ts";

  _wrapTool = (tool: Tool): DynamicStructuredTool => {
    const toolName = tool.slug;
    const description = tool.description;
    const appName = tool.toolkit.name?.toLowerCase();

    const func = async (...kwargs: unknown[]): Promise<unknown> => {
      const connectedAccountId = this.client?.getConnectedAccountId(appName);
      return JSON.stringify(
        await this.client?.tools.execute(toolName, {
          arguments: kwargs[0] as Record<string, unknown>,
          entity_id: this.client.userId ?? this.DEFAULT_ENTITY_ID,
          connected_account_id: connectedAccountId,
        })
      );
    };

    const parameters = jsonSchemaToModel(tool.input_parameters);

    return new DynamicStructuredTool({
      name: toolName,
      description,
      schema: parameters,
      func: func,
    });
  };

  async getTools() {
    this.client?.FILE_NAME
    return tools
  }
}

const myToolSet = new MyToolSet()

console.log(tools)