# Code Execution Agent

The project generates and executes code based on user-defined problems. It utilizes the Composio and connects your AI Agent to E2B’s Code Interpreter to facilitate code execution, allowing users to input a problem statement and receive executable code as output. The agent is designed to operate in a sandbox environment, ensuring safe execution and accurate results. Key functionalities include code generation, execution, and result interpretation, making it an invaluable resource for developers and data scientists alike.

<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: fit-content; background-color: #f5f5f5;">
  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub Logo" width="50" style="vertical-align: middle; margin-right: 10px;">
  <strong style="font-size: 1.2em;"><a href="">Code Execution Agent GitHub Repository</a></strong>
  <p style="margin-top: 8px; font-size: 1em;">Explore the complete source code for the RAG Agent project. This repository contains all the necessary files and scripts to set up and run the RAG system using CrewAI and Composio.</p>
</div>



+ ## 1. Import Required Packages
  Import necessary packages for the Code Execution Agent:
  ### Import statements
  ```javascript
  import dotenv from 'dotenv';
  import { ChatOpenAI } from "@langchain/openai";
  import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
  import { pull } from "langchain/hub";
  import { LangchainToolSet } from "composio-core";

  dotenv.config();
  ```


+ ## 2. Initialize Composio Toolset
  Set up the Composio toolset and get the required tools:
  ### Connect to CodeInterpreter
  ```javascript
   const toolset = new LangchainToolSet({ 
      apiKey: process.env.COMPOSIO_API_KEY
  });

  const tools = await toolset.getActions({ 
      actions: ["codeinterpreter_create_sandbox", "codeinterpreter_execute_code"] 
  });

  ```



+ ## 3. Set up the AI Model
  Initialize the OpenAI ChatGPT model:
  ### Initialise Model
  ```javascript
  const llm = new ChatOpenAI({ 
      model: "gpt-4o",
      apiKey: process.env.OPEN_AI_API_KEY
  });
  ```



+ ## 4. Create the AI Agent
  Set up the agent’s prompt and create the OpenAI Functions Agent:
  ### Setup Agent
  ```javascript 
  const prompt = await pull("hwchase17/openai-functions-agent");
  const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt });
  ```



+ ## 5. Set up the Agent Executor
  Create the AgentExecutor to run the agent:
  ### Creating Agent Executor
  ```javascript
  const agentExecutor = new AgentExecutor({ 
      agent, 
      tools, 
      verbose: true,
  });
  ```



+ ## 6. Define the Code Execution Function
  Create the main function to generate and execute code:
  ### Main Function
  ```javascript
  async function executeCodeAgent(userProblem) {
    // Generate code
    console.log("Generating code for the problem...");
    const codeGenerationResult = await agentExecutor.invoke({ 
        input: `Generate Python code to solve the following problem: ${userProblem}. 
                Only provide the code, no explanations.`
    });
    const generatedCode = codeGenerationResult.output;
    console.log("Generated Code:", generatedCode);

    // Execute code
    console.log("\nExecuting the generated code...");
    const executionResult = await agentExecutor.invoke({ 
        input: `Execute the following Python code:\n${generatedCode}`
    });
    console.log("\nExecution Result:", executionResult.output);
  }
  ```




+ ## 7. Run the Code Execution Agent
  Execute the agent with a sample problem:
  ### Run the Agent
  ```javascript
  const userProblem = "Create a list of prime numbers up to 50";
  executeCodeAgent(userProblem).catch(error => console.error("An error occurred:", error));
  ```



# Complete Code
Here’s the complete javascript Code:
### javascript Final Code
```javascript

import dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";
import { LangchainToolSet } from "composio-core";

dotenv.config();

async function executeCodeAgent(userProblem) {
    const toolset = new LangchainToolSet({ 
        apiKey: process.env.COMPOSIO_API_KEY
    });

    const tools = await toolset.getActions({ 
        actions: ["codeinterpreter_create_sandbox", "codeinterpreter_execute_code"] 
    });

    const llm = new ChatOpenAI({ 
        model: "gpt-4o",
        apiKey: process.env.OPEN_AI_API_KEY
    });

    const prompt = await pull("hwchase17/openai-functions-agent");
    const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt });

    const agentExecutor = new AgentExecutor({ 
        agent, 
        tools, 
        verbose: true,
    });

    console.log("Generating code for the problem...");
    const codeGenerationResult = await agentExecutor.invoke({ 
        input: `Generate Python code to solve the following problem: ${userProblem}. 
                Only provide the code, no explanations.`
    });
    const generatedCode = codeGenerationResult.output;
    console.log("Generated Code:", generatedCode);

    console.log("\nExecuting the generated code...");
    const executionResult = await agentExecutor.invoke({ 
        input: `Execute the following Python code:\n${generatedCode}`
    });
    console.log("\nExecution Result:", executionResult.output);
}

const userProblem = "Create a list of prime numbers up to 50";
executeCodeAgent(userProblem).catch(error => console.error("An error occurred:", error));
```