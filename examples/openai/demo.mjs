import express from 'express';
import { OpenAI } from "openai";
import { OpenAIToolSet } from "composio-core";

const app = express();
const PORT = process.env.PORT || 2001;

app.use(express.json());

app.get('/webhook', async (req, res) => {
    try {
        const body = "TITLE: HELLO WORLD, DESCRIPTION: HELLO WORLD for the repo - utkarsh-dixit/speedy"
        
        const toolset = new OpenAIToolSet(
            process.env.COMPOSIO_API_KEY,
        );
        const tools = await toolset.get_actions([
            "github_issues_create"
          ]);

        const client = new OpenAI({})
        const response = await client.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [{ 
                role: "user", 
                content: body,
            }],
            tools: tools,
            tool_choice: "auto",
        })

        console.log(response.choices[0].message.tool_calls);
        await toolset.handle_tool_call(response);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});