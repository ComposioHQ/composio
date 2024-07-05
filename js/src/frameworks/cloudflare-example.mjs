import { CloudflareToolSet } from "./cloudflare.js";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const toolset = new CloudflareToolSet({
  apiKey: "gz9byycic0mhhk2plynqyb",
});

const app = new Hono();

async function setupUserConnectionIfNotExists(entityId) {
  // ... (keep this function as is)
}

async function executeAgent(entityName) {
  const entity = await toolset.client.getEntity(entityName);
  await setupUserConnectionIfNotExists(entity.id);

  const tools = await toolset.get_actions(
    { actions: ["github_issues_create"] },
    entity.id
  );
  const instruction =
    "Make an issue with sample title in the repo - anonthedev/break";

  return { entity, tools, instruction };
}

// Set up the route
app.post("/", async (c) => {
  try {
    const { entity, tools, instruction } = await executeAgent("github");

    // const { content } = await c.req.json();

    let messages = [
      {
        role: "system",
        content:
          "You are a helpful assistant that I can talk with. Only call tools if I ask for them.",
      },
      { role: "user", content:instruction },
    ];

    console.log(c.env)
    // const toolCallResp = await c.env.AI.run(config.model, {
    //   messages,
    //   tools,
    // });

    return c.json({"something": "somthing"});
  } catch (error) {
    console.error(error);
    return c.json({ error: "An error occurred" }, 500);
  }
});

// Set up the server
const port = 3000;
console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port: port,
});
