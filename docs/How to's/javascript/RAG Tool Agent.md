# RAG Tool Agent

This project involves setting up and running a system of agents to add content to a RAG (Retrieval-Augmented Generation) tool, perform queries, and return relevant information. We use Composio to set up this Local Tool and OpenAI GPT-4o to power the agents. Follow this guide to set up and run the project.

<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: fit-content; background-color: #f5f5f5;">
  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub Logo" width="50" style="vertical-align: middle; margin-right: 10px;">
  <strong style="font-size: 1.2em;"><a href="https://github.com/ComposioHQ/composio/tree/master/js/examples/docs-example/rag_tool_agent">RAG Agent GitHub Repository</a></strong>
  <p style="margin-top: 8px; font-size: 1em;">Explore the complete source code for the RAG Agent project. This repository contains all the necessary files and scripts to set up and run the RAG system using CrewAI and Composio.</p>
</div>



+ ## 1. Imports and Environment Setup
  Import the necessary libraries and set up your environment variables.
  ### Import libraries
  ```javascript
  import dotenv from 'dotenv';
  import { ExecEnv, LangchainToolSet } from 'composio-core';
  import { ChatOpenAI } from '@langchain/openai';
  import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
  import { pull } from 'langchain/hub';

  // Load environment variables
  dotenv.config();
  ```


+ ## 2. Initialize Language Model and Define Tools
  Initialize the language model with OpenAI API key and model name, and set up the necessary tools for the agents.
  ### LLM and Tools
  ```javascript
  // Initialize the LLM with the OpenAI GPT-4-turbo model
  const llm = new ChatOpenAI({ model: "gpt-4-turbo" });

  // Initialize the Composio ToolSet
  const composioToolset = new LangchainToolSet({
      apiKey: process.env.COMPOSIO_API_KEY,
      workspaceEnv: ExecEnv.DOCKER
  });

  // Get the RAG tool actions from the Composio ToolSet
  const tools = await composioToolset.getActions({
      actions: ["ragtool_add_content", "ragtool_query"]
  });
  ```



+ ## 3. Define the RAG Agent
  Define the RAG agent with its llm, prompt and tools.
  ### Creating Agents
  ```javascript
  const prompt = await pull("hwchase17/openai-functions-agent");

  const agent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt,
  });

  const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: true,
  });
  ```



+ ## 4. Adding Content
  Create tasks to add content to the RAG tool for enriching its knowledge base.
  ### Add Content
  ```javascript 
  async function addContentToRAG(content) {
    const result = await agentExecutor.invoke({
        input: `Add the following content to the RAG tool to enrich its knowledge base: ${content}`
    });
    console.log(result.output);
    return result.output;
  }

  // Example content to add
  const additionalContentList = [
      "Paris is the capital of France. It is known for its art, fashion, and culture.",
      "Berlin is the capital of Germany. It is famous for its history and vibrant culture.",
      "Tokyo is the capital of Japan. It is known for its technology and cuisine.",
      "Canberra is the capital of Australia. It is known for its modern architecture and museums.",
  ];

  // Add content to RAG tool
  for (const content of additionalContentList) {
      await addContentToRAG(content);
  }
  ```



+ ## 5. Define and Execute Query Task
  Create and execute the task for querying the RAG tool based on user input.
  ### Query Function
  ```javascript
   async function queryRAG(userQuery) {
      const result = await agentExecutor.invoke({
          input: `Formulate a query based on this input: ${userQuery}. 
                  Retrieve relevant information using the RAG tool and return the results.`
      });
      console.log(result.output);
      return result.output;
    }

  // Example usage
  const userQuery = "What is the capital of France?";
  const queryResult = await queryRAG(userQuery);
  console.log("Query Result:", queryResult);
  ```



       
# Putting it All Together
### Javascript Final Code
```javascript


import dotenv from 'dotenv';
import { ExecEnv, LangchainToolSet } from 'composio-core';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { pull } from 'langchain/hub';

dotenv.config();

(async () => {
    const llm = new ChatOpenAI({ model: "gpt-4-turbo" });

    const composioToolset = new LangchainToolSet({
        apiKey: process.env.COMPOSIO_API_KEY,
        workspaceEnv: ExecEnv.DOCKER
    });

    const tools = await composioToolset.getActions({
        actions: ["ragtool_add_content", "ragtool_query"]
    });

    const prompt = await pull("hwchase17/openai-functions-agent");
    
    const agent = await createOpenAIToolsAgent({
        llm,
        tools,
        prompt,
    });

    const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: true,
    });

    async function addContentToRAG(content) {
        const result = await agentExecutor.invoke({
            input: `Add the following content to the RAG tool to enrich its knowledge base: ${content}`
        });
        console.log(result.output);
        return result.output;
    }

    async function queryRAG(userQuery) {
        const result = await agentExecutor.invoke({
            input: `Formulate a query based on this input: ${userQuery}. 
                    Retrieve relevant information using the RAG tool and return the results.`
        });
        console.log(result.output);
        return result.output;
    }

    // Example content to add
    const additionalContentList = [
        "Paris is the capital of France. It is known for its art, fashion, and culture.",
        "Berlin is the capital of Germany. It is famous for its history and vibrant culture.",
        "Tokyo is the capital of Japan. It is known for its technology and cuisine.",
        "Canberra is the capital of Australia. It is known for its modern architecture and museums.",
    ];

    // Add content to RAG tool
    for (const content of additionalContentList) {
        await addContentToRAG(content);
    }

    // Example query
    const userQuery = "What is the capital of France?";
    const queryResult = await queryRAG(userQuery);
    console.log("Query Result:", queryResult);
})();
```