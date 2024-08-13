import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { VercelAIToolSet } from "../../../../../../lib";
import { NextResponse } from "next/server";

export async function GET() {
  let finalResult;
  // Setup toolset
  const toolset = new VercelAIToolSet({
    apiKey: process.env.COMPOSIO_API_KEY,
  });

  async function setupUserConnectionIfNotExists(entityId: string | undefined) {
    const entity = await toolset.client.getEntity(entityId);
    const connection = await entity.getConnection("googlesheets");

    if (!connection) {
      // If this entity/user hasn't already connected the account
      const connection = await entity.initiateConnection("googlesheets");
      console.log("Log in via: ", connection.redirectUrl);
      return connection.waitUntilActive(60);
    }

    return connection;
  }

  async function executeAgent(entityName: string | undefined) {
    // setup entity
    const entity = await toolset.client.getEntity(entityName);
    await setupUserConnectionIfNotExists(entity.id);

    // get tools based on actions
    const tools = await toolset.get_actions({
      actions: ["googlesheets_create_google_sheet1"],
    });

    // Call generateText with required tools and toolChoice set to required.
    const result = await generateText({
      model: openai("gpt-4-turbo"),
      tools,
      toolChoice: "required",
      prompt: "Create a google sheet on my account",
    });

    // Call handle_tool_call method from toolset with result.toolCalls and entity.id as arguments
    finalResult = await toolset.handle_tool_call(result.toolCalls, entity.id);
    console.log(finalResult);
    return finalResult;
  }

  const result: any = await executeAgent("default");
  return NextResponse.json(JSON.parse(result[0]));
}
