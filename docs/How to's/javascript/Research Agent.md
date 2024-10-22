# Research Agent

### This guide provides detailed steps to create a Demo Assistant using Composio and OpenAI. You will build a system capable of interacting with GitHub to create issues and fetch user information.

#### This project is an example that uses Composio to seamlessly interact with GitHub through an AI assistant. It automatically creates issues and retrieves user information based on user input.

<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: fit-content; background-color: #f5f5f5;">
  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub Logo" width="50" style="vertical-align: middle; margin-right: 10px;">
  <strong style="font-size: 1.2em;"><a href="https://github.com/ComposioHQ/composio/blob/master/js/examples/openai/demo_assistant.mjs">Research Agent GitHub Repository</a></strong>
  <p style="margin-top: 8px; font-size: 1em;">Explore the complete source code for the Demo Assistant project. This repository contains all the necessary files and scripts to set up and run the Demo Assistant using Composio and OpenAI.</p>
</div>



+ ## 1. Import base packages
  Next, we’ll import the essential libraries for our project.
  ### JS - Import statements
  ```javascript
  import express from 'express';
  import { OpenAI } from "openai";
  import { OpenAIToolSet, Action } from "composio-core";
  ```


+ ## 2. Initialize Express App
  We’ll initialize our Express application and set up the necessary configurations.
  ### Initialize Express App
  ```javascript
  const app = express();
  const PORT = process.env.PORT || 2001;
  const research_topic = "LLM agents function calling"
  const target_repo = "composiohq/composio"
  app.use(express.json());
  ```



+ ## 3. Define Webhook Endpoint
  Define the webhook endpoint for JS that will handle incoming requests and interact with the OpenAI API.
  ### Define Webhook
  ```javascript
  app.get('/webhook', async (req, res) => {
    try {
        const body = `Please research on Arxiv about \`${researchTopic}\`, organize 
        the top ${nIssues} results as ${nIssues} issues for 
        a GitHub repository, and finally raise those issues with proper 
        title, body, implementation guidance, and references in 
        the ${targetRepo} repo, as well as relevant tags and assignees as 
        the repo owner.`;
        
        const toolset = new OpenAIToolSet({
            apiKey: process.env.COMPOSIO_API_KEY,
        });
        const tools = await toolset.get_actions([
            Action.SERPAPI_SEARCH,
            Action.GITHUB_USERS_GET_AUTHENTICATED,
            Action.GITHUB_ISSUES_CREATE
        ]);

        const client = new OpenAI({});
        const assistant = await client.beta.assistants.create({
            model: "gpt-4-turbo",
            description: "This is a test assistant",
            instructions: "You are a helpful assistant that takes actions on user's GitHub",
            tools: tools,
        });

        const thread = await client.beta.threads.create({
            messages: [{
                role: "user",
                content: body
            }]
        });

        let run = await client.beta.threads.runs.create(thread.id, {
            assistant_id: assistant.id,
        });

        run = await toolset.wait_and_handle_assistant_tool_calls(client, run, thread);
        
        // Check if the run is completed
        if (run.status === "completed") {
            let messages = await client.beta.threads.messages.list(thread.id);
            console.log(messages.data);
            return messages.data;
        } else if (run.status === "requires_action") {
            console.log(run.status);
            return await toolset.handle_assistant_message(run);
        } else {
            console.error("Run did not complete:", run);
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
  });
  ```



+ ## 4. Start the Server
  Finally, we’ll start the Express server for JS to listen for incoming requests.
  ### Start Server
  ```javascript 
  app.listen(PORT, () => {
     console.log(`Server is running on port ${PORT}`);
  });     
  ```




# Putting it All Together
### Javascript Final Code
```javascript
import express from 'express';
import { OpenAI } from "openai";
import { OpenAIToolSet, Action } from "composio-core";

const app = express();
const PORT = process.env.PORT || 2001;

app.use(express.json());

app.get('/webhook', async (req, res) => {
    try {
        const body = "TITLE: HELLO WORLD, DESCRIPTION: HELLO WORLD for the repo - utkarsh-dixit/speedy";
        
        const toolset = new OpenAIToolSet({
            apiKey: process.env.COMPOSIO_API_KEY,
        });
        const tools = await toolset.get_actions([
            Action.GITHUB_USERS_GET_AUTHENTICATED,
            Action.GITHUB_ISSUES_CREATE
        ]);

        const client = new OpenAI({});
        const assistant = await client.beta.assistants.create({
            model: "gpt-4-turbo",
            description: "This is a test assistant",
            instructions: "You are a helpful assistant that takes actions on user's GitHub",
            tools: tools,
        });

        const thread = await client.beta.threads.create({
            messages: [{
                role: "user",
                content: body
            }]
        });

        let run = await client.beta.threads.runs.create(thread.id, {
            assistant_id: assistant.id,
        });

        run = await toolset.wait_and_handle_assistant_tool_calls(client, run, thread);
        
        // Check if the run is completed
        if (run.status === "completed") {
            let messages = await client.beta.threads.messages.list(thread.id);
            console.log(messages.data);
            return messages.data;
        } else if (run.status === "requires_action") {
            console.log(run.status);
            return await toolset.handle_assistant_message(run);
        } else {
            console.error("Run did not complete:", run);
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
```