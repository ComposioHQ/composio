import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import type { Optional } from "../types/util";
import { LangchainToolSet as BaseComposioToolSet } from "./langchain";

export class LangGraphToolSet extends BaseComposioToolSet {
  /**
   * Composio toolset for Langgraph framework.
   *
   */

  static FRAMEWORK_NAME = "langGraph";
  static DEFAULT_ENTITY_ID = "default";

  constructor(
    config: {
      apiKey?: Optional<string>;
      baseUrl?: Optional<string>;
      entityId?: string;
      connectedAccountIds?: Record<string, string>;
      allowTracing?: boolean;
    } = {}
  ) {
    super({
      apiKey: config.apiKey || null,
      baseUrl: config.baseUrl || COMPOSIO_BASE_URL,
      entityId: config.entityId || LangGraphToolSet.DEFAULT_ENTITY_ID,
      runtime: LangGraphToolSet.FRAMEWORK_NAME,
      connectedAccountIds: config.connectedAccountIds,
      allowTracing: config.allowTracing || false,
    });
  }
}
