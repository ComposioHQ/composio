import { Composio } from "@composio/core";
import { OpenAIToolset } from "@composio/openai-toolset";


const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new OpenAIToolset(),
});

const tool = await composio.getTool("HACKERNEWS_SEARCH_POSTS");
console.log(tool);
