/**
 * Google GenAI Example
 *
 * This example demonstrates how to use Composio SDK with Google's GenAI (Gemini).
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
 * 2. Set up your GEMINI_API_KEY in the .env file
 * 3. Run the example: pnpm start
 */

import { Composio } from '@composio/core';
import { GoogleGenAI } from '@google/genai';
import { GoogleProvider } from '@composio/google';
import 'dotenv/config';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const provider = new GoogleProvider();
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider,
});

/**
 * Main function to run the example
 */
async function main() {
  try {
    console.log('🚀 Starting Google GenAI Example...');
    
    const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');
    
    console.log(`✅ Found ${tools.length} tools`);
    
    const task = "Fetch the details of the user 'haxzie'";
    console.log(`📝 Task: ${task}`);
    
    const wrappedTools = provider.wrapTools(tools as any);
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-001',
      contents: task,
      config: {
        tools: [{ functionDeclarations: wrappedTools as any }],
      },
    });
    
    console.log('✅ Response received from Gemini');
    
    if (response.functionCalls) {
      console.log(`✅ Calling tool ${response.functionCalls[0].name}`);
      const functionCall = {
        name: response.functionCalls[0].name || '',
        args: response.functionCalls[0].args || {}
      };
      const result = await provider.executeToolCall(
        'default',
        functionCall
      );
      console.log('📊 Result:');
      console.log(JSON.parse(result).data);
    } else {
      console.log('📝 No function calls in the response');
      console.log(response.text);
    }
    
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
