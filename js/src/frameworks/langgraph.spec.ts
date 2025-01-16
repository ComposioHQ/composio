import { describe, expect, it } from "@jest/globals";
import { getTestConfig } from "../../config/getTestConfig";
import { LangGraphToolSet } from "./langgraph";

// LangGraph extens langchain class, all the properties are same
describe("Apps class tests", () => {
  it("getools", async () => {
    const langgraphToolSet = new LangGraphToolSet({
      apiKey: getTestConfig().COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });
    const tools = await langgraphToolSet.getTools({
      apps: ["github"],
    });
    expect(tools).toBeInstanceOf(Array);
  });
});
