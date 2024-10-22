# Calendar Agent

This project is an example which uses Composio to seamlessly convert your to-do lists into Google Calendar events. It automatically schedules tasks with specified labels and times, ensuring your calendar is always up-to-date and organized.

<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: fit-content; background-color: #f5f5f5;">
  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub Logo" width="50" style="vertical-align: middle; margin-right: 10px;">
  <strong style="font-size: 1.2em;"><a href="https://github.com/ComposioHQ/composio/tree/master/js/examples/docs-example/calendar_agent">Calendar Agent GitHub Repository</a></strong>
  <p style="margin-top: 8px; font-size: 1em;">Explore the complete source code for the Calendar Agent project. This repository contains all the necessary files and scripts to set up and run the Calendar Agent using CrewAI and Composio.</p>
</div>



+ ## 1. Install the required packages
  Create a .env file and add your OpenAI API Key.
  ### Install the required packages
  ```javascript
  pnpm add composio-core dotenv langchain @langchain/openai
  ```


+ ## 2. Import base packages
  Next, we’ll import the essential libraries for our project.
  ### JS - Import statements
  ```javascript
  import dotenv from 'dotenv';
  import { ChatOpenAI } from "@langchain/openai";
  import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
  import { pull } from "langchain/hub";
  import { LangchainToolSet } from "composio-core";

  dotenv.config();
  ```



+ ## 3. Initialise Language Model and Define tools
  We’ll initialize our language model and set up the necessary tools for our agents.
  ### Models and Tools
  ```javascript
  // Initialize the language model
  const llm = new ChatOpenAI({ model: "gpt-4-turbo" });

  // Define tools for the agents
  // We are using Google calendar tool from composio to connect to our calendar account.
  const composioToolset = new LangchainToolSet({
      apiKey: process.env.COMPOSIO_API_KEY
  });
  const tools = await composioToolset.getActions({
      actions: ["googlecalendar_create_event", "googlecalendar_list_events"]
  });

  // Retrieve the current date and time
  const getCurrentDate = () => new Date().toISOString().split('T')[0];
  const getTimezone = () => new Date().toLocaleTimeString('en-us', { timeZoneName: 'short' }).split(' ')[2];

  const date = getCurrentDate();
  const timezone = getTimezone();
  ```



+ ## 4. Setup Todo
  Define the todo list that we want to convert into calendar events.
  ### JS - Todo Setup
  ```javascript 
  // Setup Todo
  const todo = `
    1PM - 3PM -> Code solo
    5PM - 7PM -> Meeting,
    9AM - 12AM -> Learn something,
    8PM - 10PM -> Game
  `;      
  ```



+ ## 5. Create and Execute Agent
  Finally, we’ll define and execute the agent responsible for creating Google Calendar events based on the todo list.
  ### Run agent
  ```javascript
  // Create and Execute Agent.
  async function runAgent() {
      const prompt = await pull("hwchase17/openai-functions-agent");
      const agent = await createOpenAIFunctionsAgent({
          llm,
          tools,
          prompt
      });

      const agentExecutor = new AgentExecutor({
          agent,
          tools,
          verbose: true,
      });

      const result = await agentExecutor.invoke({
          input: `Book slots according to this todo list: ${todo}. 
                  Label them with the work provided to be done in that time period. 
                  Schedule it for today. Today's date is ${date} (it's in YYYY-MM-DD format) 
                  and make the timezone be ${timezone}.`
      });

      console.log(result.output);
      return "Agent execution completed";
  }

  runAgent().then(console.log).catch(console.error);
  ```




# Complete Code
### javascript Final Code
```javascript

# import dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { pull } from "langchain/hub";
import { LangchainToolSet } from "composio-core";

dotenv.config();

// Initialize the language model
const llm = new ChatOpenAI({ model: "gpt-4-turbo"});

// Define tools for the agents
const composioToolset = new LangchainToolSet({
    apiKey: process.env.COMPOSIO_API_KEY
});

// Retrieve the current date and time
const getCurrentDate = () => new Date().toISOString().split('T')[0];
const getTimezone = () => new Date().toLocaleTimeString('en-us', { timeZoneName: 'short' }).split(' ')[2];

const date = getCurrentDate();
const timezone = getTimezone();

// Setup Todo
const todo = `
    1PM - 3PM -> Code solo
`;

async function runAgent() {
    const tools = await composioToolset.getActions({
    actions: ["googlecalendar_create_event", "googlecalendar_list_events"]
});
    const prompt = await pull("hwchase17/openai-functions-agent");
    const agent = await createOpenAIFunctionsAgent({
        llm,
        tools,
        prompt
    });

const agentExecutor = new AgentExecutor({
    agent,
    tools,
    verbose: true,
});

const result = await agentExecutor.invoke({
    input: `Book slots according to this todo list: ${todo}. 
            Label them with the work provided to be done in that time period. 
            Schedule it for today. Today's date is ${date} (it's in YYYY-MM-DD format) 
            and make the timezone be ${timezone}.`
});

console.log(result.output);
return "Agent execution completed";
}

runAgent().then(console.log).catch(console.error);
```