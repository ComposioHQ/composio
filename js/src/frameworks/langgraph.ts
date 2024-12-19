import { COMPOSIO_BASE_URL } from "../sdk/client/core/OpenAPI";
import type { Optional } from "../types/base";
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
    } = {}
  ) {
    super({
      apiKey: config.apiKey || null,
      baseUrl: config.baseUrl || COMPOSIO_BASE_URL,
      entityId: config.entityId || LangGraphToolSet.DEFAULT_ENTITY_ID,
      runtime: LangGraphToolSet.FRAMEWORK_NAME,
    });
  }
}
