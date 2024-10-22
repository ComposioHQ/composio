# SQL Agent

### This guide provides detailed steps to create an agent that leverages Composio to perform SQL queries and file operations.

#### This project involves setting up and running a system of agents to conduct SQL queries, write the output to a file, and plot graphs based on the data. We use Composio to set up the tools and OpenAI GPT-4-turbo to power the agents. Follow this guide to set up and run the project.

<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: fit-content; background-color: #f5f5f5;">
  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub Logo" width="50" style="vertical-align: middle; margin-right: 10px;">
  <strong style="font-size: 1.2em;"><a href="https://github.com/ComposioHQ/composio/blob/master/js/examples/docs-example/sql_agent/agent.mjs">SQL Agent GitHub Repository</a></strong>
  <p style="margin-top: 8px; font-size: 1em;">Explore the complete source code for the SQL Agent project. This repository contains all the necessary files and scripts to set up and run the SQL Agent system using Langchain and Composio.</p>
</div>



+ ## 1. Install the required dependencies
  ### Install Langchain and Composio
  ```javascript
      pnpm install @langchain/openai composio-core langchain dotenv
  ```


+ ## 2. Imports and Environment Setup
  In your JavaScript script, import the necessary libraries and set up your environment variables.
  ### Import required dependencies
  ```javascript
  import dotenv from 'dotenv';
  import { ChatOpenAI } from "@langchain/openai";
  import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
  import { ComposioToolSet } from "composio-core";
  import { pull } from "langchain/hub";

  dotenv.config();
  ```



+ ## 3. Initialize Composio ToolSet and Define Functions
  Initialize the Composio ToolSet and define the functions for executing SQL queries and plotting graphs.
  ### Initialise the toolset and define the functions
  ```javascript
  const composioToolset = new ComposioToolSet();

  async function executeSQLQuery(query) {
      const sqlTools = await composioToolset.getTools({ apps: ["sqltool", "filetool"] });
      const llm = new ChatOpenAI({ model: "gpt-4-turbo" });
      const prompt = await pull("hwchase17/openai-functions-agent");
      const agent = await createOpenAIFunctionsAgent({ llm, tools: sqlTools, prompt });

      const agentExecutor = new AgentExecutor({
          agent,
          tools: sqlTools,
          verbose: true,
      });

      const result = await agentExecutor.invoke({
          input: `Execute the following SQL query and write the output to a file named 'output.txt': ${query}`
      });

      console.log("Query Result:", result.output);
      return result.output;
  }

  async function plotGraph(data) {
      const allTools = await composioToolset.getTools({ apps: ["sqltool", "filetool", "codeinterpreter"] });
      const llm = new ChatOpenAI({ model: "gpt-4-turbo" });
      const prompt = await pull("hwchase17/openai-functions-agent");
      const codeAgent = await createOpenAIFunctionsAgent({ llm, tools: allTools, prompt });
      const codeExecutor = new AgentExecutor({
          agent: codeAgent,
          tools: allTools,
          verbose: true,
      });

      const result = await codeExecutor.invoke({
          input: `Using the following data, plot a graph: ${data}`
      });

      console.log("Graph Result:", result.output);
      return result.output;
  }

  ```



+ ## 4. Define and Execute the Main Function
  Create the main function to run the SQL Agent and execute it.
  ### Execute the Agent
  ```javascript 
  async function runSQLAgent() {
      const query = "SELECT * FROM users LIMIT 10";
      const queryResult = await executeSQLQuery(query);
      const graphResult = await plotGraph(queryResult);
  }

  runSQLAgent().catch(error => console.error("An error occurred:", error));
  ```




# Putting it All Together
### Final Code
```javascript
import dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ComposioToolSet } from "composio-core";
import { pull } from "langchain/hub";

dotenv.config();

const composioToolset = new ComposioToolSet();

async function executeSQLQuery(query) {
    const sqlTools = await composioToolset.getTools({ apps: ["sqltool", "filetool"] });
    const llm = new ChatOpenAI({ model: "gpt-4-turbo" });
    const prompt = await pull("hwchase17/openai-functions-agent");
    const agent = await createOpenAIFunctionsAgent({ llm, tools: sqlTools, prompt });

    const agentExecutor = new AgentExecutor({
        agent,
        tools: sqlTools,
        verbose: true,
    });

    const result = await agentExecutor.invoke({
        input: `Execute the following SQL query and write the output to a file named 'output.txt': ${query}`
    });

    console.log("Query Result:", result.output);
    return result.output;
}

async function plotGraph(data) {
    const allTools = await composioToolset.getTools({ apps: ["sqltool", "filetool", "codeinterpreter"] });
    const llm = new ChatOpenAI({ model: "gpt-4-turbo" });
    const prompt = await pull("hwchase17/openai-functions-agent");
    const codeAgent = await createOpenAIFunctionsAgent({ llm, tools: allTools, prompt });
    const codeExecutor = new AgentExecutor({
        agent: codeAgent,
        tools: allTools,
        verbose: true,
    });

    const result = await codeExecutor.invoke({
        input: `Using the following data, plot a graph: ${data}`
    });

    console.log("Graph Result:", result.output);
    return result.output;
}

async function runSQLAgent() {
    const query = "SELECT * FROM users LIMIT 10";
    const queryResult = await executeSQLQuery(query);
    const graphResult = await plotGraph(queryResult);
}

runSQLAgent().catch(error => console.error("An error occurred:", error));
```