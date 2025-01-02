import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { VercelAIToolSet } from 'composio-core';
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    let finalResult;
    
    // Setup toolset
    const toolset = new VercelAIToolSet({
      apiKey: process.env.COMPOSIO_API_KEY,
    });

    async function setupUserConnectionIfNotExists(entityId: string | undefined) {
      const entity = await toolset.client.getEntity(entityId);
      const connection = await entity.getConnection({app: "googlesheets"});

      if (!connection) {
        // If this entity/user hasn't already connected the account
        const connection = await entity.initiateConnection({appName: "googlesheets"});
        console.log("Log in via: ", connection.redirectUrl);
        return connection.waitUntilActive(60);
      }

      return connection;
    }

    async function executeAgent(entityName: string | undefined) {
      // setup entity
      const entity = await toolset.client.getEntity(entityName);
      await setupUserConnectionIfNotExists(entity.id);
      const spreadsheet_id = '1P9vE1IAZbI950cye58I6E4A3Uu8G-rcA4JAm52Pxnsw';
      // get tools based on actions
      const tools = await toolset.getTools({
        actions: ["GOOGLESHEETS_BATCH_GET", 
          "GOOGLESHEETS_BATCH_UPDATE", 
          "GOOGLESHEETS_GET_SPREADSHEET_INFO", 
          "GOOGLESHEETS_CLEAR_VALUES",
          "GOOGLESHEETS_CREATE_GOOGLE_SHEET1",
          "TAVILY_TAVILY_SEARCH",
          "CODEINTERPRETER_UPLOAD_FILE_CMD",
          "CODEINTERPRETER_GET_FILE_CMD",
          "CODEINTERPRETER_EXECUTE_CODE",
          "CODEINTERPRETER_RUN_TERMINAL_CMD"
        ],
      });

      // Store both the AI response and tool execution result
      const aiResponse = await generateText({
        model: openai("gpt-4o"),
        tools,
        toolChoice: "auto",
        system:`You are a sheets assistant. You have access to the user's google sheets and you can perform actions on it using the tools you have. Introduce yourself as a sheets agent. This is the id you need to perform actions on: ${spreadsheet_id}`,
        messages: messages,
      });

      let finalResult = null;
      if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
        finalResult = await toolset.executeToolCall(
          {
            name: aiResponse.toolCalls[0].toolName, 
            arguments: aiResponse.toolCalls[0].args
          },
          entity.id
        );
        console.log(finalResult);
      }
      console.log(aiResponse);

      const { text } = await generateText({
        model: openai('gpt-4o'),
        prompt: finalResult 
          ? `Given the following user request: "${messages[messages.length - 1].content}", here's what happened: ${aiResponse.text} and the result was: ${finalResult}. Reveal the result of the tool call without markdown. This is the spreadsheet id that you need to use the actions on: ${spreadsheet_id}`
          : `Print this same text, without adding any other text or sentences before or after: ${aiResponse.text}`,
      });
          
      
      return {
        aitext: text,
        aiResponse: aiResponse.text,
        toolResult: finalResult
      };
    }

    const result = await executeAgent("default");
    
    // Return a structured response with both results
    return NextResponse.json({
        role: 'assistant',
        content: `${result.aitext}`
      });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({
      role: 'assistant',
      content: 'Sorry, there was an error processing your request.'
    }, { status: 500 });
  }
}
