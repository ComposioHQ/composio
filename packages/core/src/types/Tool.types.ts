import { ToolListResponse, ToolRetrieveResponse } from "@composio/client/resources/tools";

export type Tool = ToolRetrieveResponse | ToolListResponse.Item;