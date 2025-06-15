import { OpenAIToolSet, type ActionExecutionResDto } from "composio-core";
import { z } from "zod";

const toolset = new OpenAIToolSet();

await toolset.createAction({
    actionName: "get_github_repo_topics",
    toolName: "github",
    description: "Gets the topics associated with a specific GitHub repository.",
    inputParams: z.object({
        owner: z.string().describe("Repository owner username"),
        repo: z.string().describe("Repository name"),
    }),
    callback: async (inputParams, _authCredentials, executeRequest): Promise<ActionExecutionResDto> => {
         const { owner, repo } = inputParams as { owner: string, repo: string };
         const response = await executeRequest({
             endpoint: `/repos/${owner}/${repo}/topics`,
             method: "GET",
             parameters: [],
         });

         const topics = (response as any)?.names ?? [];
         return { successful: true, data: { topics: topics } };
    }
});