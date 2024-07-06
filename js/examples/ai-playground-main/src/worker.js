import { faker } from '@faker-js/faker';
import { Hono } from "hono";
import ui from "./ui.html";

const app = new Hono();

const config = {
  model: "@hf/nousresearch/hermes-2-pro-mistral-7b"
}

app.get("/", (c) => c.html(ui));

app.post("/", async (c) => {
  try {
    const { content } = await c.req.json();

    let messages = [
      { role: "system", content: "You are a helpful assistant that I can talk with. Only call tools if I ask for them." },
      { role: "user", content },
    ];

    const tools = [{
      name: "randomString",
      description: "Generate a random string",
    }]

    const toolCallResp = await c.env.AI.run(config.model, {
      messages,
      tools,
    });

    if (toolCallResp.tool_calls) {
      for (const tool_call of toolCallResp.tool_calls) {
        switch (tool_call.name) {
          case "randomString":
            const string = faker.string.alpha(10)
            messages.push({ 
              role: 'system', 
              content: `The random string is ${string}` 
            })

            let result = await c.env.AI.run(config.model, { messages });
            messages.unshift()

            messages.push({ 
              role: 'tool', 
              tool: tool_call.name,
              result: string
            })

            messages.push({ 
              role: 'assistant', 
              content: result.response
            })
        }
      }
    } else {
      // No tools used, run "tool-less"
      let result = await c.env.AI.run(config.model, {
	    	messages,
	    });

      messages.push({ role: 'assistant', content: result.response })
    }

    const filteredMessages = messages.filter(m => 
      ['assistant', 'tool'].includes(m.role)
    )

    console.log(filteredMessages)

    return c.json({ messages: filteredMessages })
  } catch (err) {
    console.log(err)
    return c.text("Something went wrong", 500)
  }
});

export default app;
