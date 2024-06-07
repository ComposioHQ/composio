
import { ChatOpenAI } from "@langchain/openai";
import type { ChatPromptTemplate } from "@langchain/core/prompts";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";

import { ComposioToolSet } from "../src/frameworks/langchain";
import { Action } from "../src/enums";

(async() => {
    const llm = new ChatOpenAI({
        model: "gpt-4o",
        temperature: 0,
      });
    
      const toolset= new ComposioToolSet(
        process.env.COMPOSIO_API_KEY!,
      );
      const tools = await toolset.get_actions([Action.GITHUB_USERS_GET_AUTHENTICATED]);
      
      // Get the prompt to use - you can modify this!\
      // If you want to see the prompt in full, you can at:
      // https://smith.langchain.com/hub/hwchase17/openai-functions-agent
      const prompt = await pull<ChatPromptTemplate>(
        "hwchase17/openai-functions-agent"
      );
      
      const agent = await createOpenAIFunctionsAgent({
        llm,
        tools,
        prompt,
      });
      
      const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: true,
      });
      
      const result = await agentExecutor.invoke({
        input: `Get user info`
      });
      
      console.log(`Got output ${result.output}`);

      return true;
})();