import { Composio } from "@composio/core";
import { OpenAIToolset } from "@composio/openai-toolset";

/**
 * General example
 */
async function constructorExample() {
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    toolset: new OpenAIToolset(),
  });

  const tool = await composio.tools.get("HACKERNEWS_SEARCH_POSTS");

  composio.toolset.handleToolCall(tool);

  tool.execute({});
}

constructorExample();
