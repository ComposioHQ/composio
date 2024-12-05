import { LangchainToolSet as BaseComposioToolSet } from "./langchain";
import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import type { Optional } from "../sdk/types";
import { WorkspaceConfig } from "../env/config";
import { Workspace } from "../env";

export class LanggraphToolSet extends BaseComposioToolSet {
  /**
   * Composio toolset for Langgraph framework.
   *
   */

  static FRAMEWORK_NAME = "langgraph";
  static DEFAULT_ENTITY_ID = "default";

  constructor(
    config: {
      apiKey?: Optional<string>;
      baseUrl?: Optional<string>;
      entityId?: string;
      workspaceConfig?: WorkspaceConfig;
    } = {}
  ) {
    super({
      apiKey: config.apiKey || null,
      baseUrl: config.baseUrl || COMPOSIO_BASE_URL,
      entityId: config.entityId || LanggraphToolSet.DEFAULT_ENTITY_ID,
      workspaceConfig: config.workspaceConfig || Workspace.Host(),
      runtime: LanggraphToolSet.FRAMEWORK_NAME,
    });
  }
}
