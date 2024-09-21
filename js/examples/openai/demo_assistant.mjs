import express from 'express';
import { OpenAI } from "openai";
import { OpenAIToolSet, Action } from "composio-core";

const app = express();
const PORT = process.env.PORT || 2001;

app.use(express.json());

app.get('/webhook', async (req, res) => {
    try {
        const body = "TITLE: HELLO WORLD, DESCRIPTION: HELLO WORLD for the repo - utkarsh-dixit/speedy"
        
        const toolset = new OpenAIToolSet({
            apiKey: process.env.COMPOSIO_API_KEY,
        });
        const tools = await toolset.get_actions([
            Action.GITHUB_USERS_GET_AUTHENTICATED,
            Action.GITHUB_ISSUES_CREATE
          ]);

        const client = new OpenAI({})
        const assistant = await client.beta.assistants.create({
            model: "gpt-4-turbo",
            description: "This is a test assistant",
            instructions: "You are a helpful assistant that take actions on user's github",
            tools: tools,
        })
        const thread = await client.beta.threads.create({
            messages: [{
                role: "user",
                content: body
            }]
        })
        let  run = await client.beta.threads.runs.create(
            thread.id,
            {
                assistant_id: assistant.id,
            }
        )
        run = await toolset.wait_and_handle_assistant_tool_calls(client, run, thread)
        
        // Check if the run is completed
        if (run.status === "completed") {
            let messages = await client.beta.threads.messages.list(thread.id);
            console.log(messages.data);
            return messages.data;
          } else if (run.status === "requires_action") {
            console.log(run.status);
            return await toolset.handle_assistant_message(run)
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