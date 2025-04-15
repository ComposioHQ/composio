import ComposioSDK from "@composio/client";
import { Tool } from "../types/Tool.types";
import { Toolset } from "../types/Toolset.types.";

export class Tools<
  TTool extends Tool,
  TToolset extends Toolset<TTool>
> {
  private client: ComposioSDK;
  private toolset: TToolset;

  constructor(client: ComposioSDK, toolset: TToolset) {
    this.client = client;
    this.toolset = toolset;
  }

  async list() {
    return this.client.tools.list();
  }

  async get(toolId: string): Promise<ReturnType<TToolset["_wrapTool"]>> {
    const tool: Tool = await this.client.tools.retrieve(toolId);
    return this.toolset._wrapTool(tool) as ReturnType<TToolset["_wrapTool"]>;
  }

  async execute(tool: string, body: { [key: string]: any }) {
    return this.client.tools.execute(tool, body);
  }

  async getToolsByEnum(toolEnum: string) {
    return this.client.tools.retrieveEnum({
      body: {
        toolEnum,
      },
    });
  }
}
