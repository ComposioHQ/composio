import { Composio } from "../composio";
import { Tool } from "../types/tool.types";
import { BaseComposioToolset } from "./BaseToolset";
import { Toolset } from "../types/toolset.types.";

/**
 * This is a default toolset implementation for Composio.
 * This class is used as a default toolset for Composio, if the user does not provide a toolset.
 * 
 * This class shouldn't be used directly or to be extended.
 */

interface CustomTool {
  name: string;
}
export class ComposioToolset extends BaseComposioToolset<CustomTool> {
  private client: Composio<CustomTool, Toolset<CustomTool>> | undefined;
  
  setClient(client: Composio<CustomTool, Toolset<CustomTool>>) {
    this.client = client;
  }

  _wrapTool = (tool: Tool): CustomTool => {
    return tool as unknown as CustomTool;
  };
}

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new ComposioToolset(),
});


