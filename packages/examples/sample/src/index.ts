import { Composio } from "@composio/core";
import { OpenAIToolSet } from "@composio/openai-toolset";

/**
 * General example
 */
async function constructorExample() {
    const composio = new Composio({
        apiKey: process.env.COMPOSIO_API_KEY,
        toolset: new OpenAIToolSet(),
    });

    const tool = await composio.tools.get("HACKERNEWS_SEARCH_POSTS");
    
    composio.toolset.handleToolCall([tool]);
}

constructorExample();
/**
 * Builder example
 */
// async function builderExample() {
//     const composio = Composio.init()
//         .withToolset(new OpenAIToolSet())
//         .withApiKey(process.env.COMPOSIO_API_KEY as string)
//         .build();

//     const tool = await composio.tools.get("HACKERNEWS_SEARCH_POSTS");

//     tool.execute();
// }

// constructorExample();
// builderExample();