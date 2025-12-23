/**
 * LiveKit Voice Agent with Composio Tools
 *
 * This example demonstrates how to use Composio tools with the LiveKit Agents SDK
 * to create a voice AI agent that can interact with external services.
 *
 * Required environment variables:
 * - LIVEKIT_API_KEY: Your LiveKit API key
 * - LIVEKIT_API_SECRET: Your LiveKit API secret
 * - LIVEKIT_URL: Your LiveKit server URL
 * - COMPOSIO_API_KEY: Your Composio API key (get one at https://app.composio.dev)
 *
 * Usage:
 *   # Load LiveKit credentials
 *   lk app env -w -d .env
 * 
 *   # Download files
 *   pnpm download-files
 *
 *   # Run in development mode
 *   pnpm dev
 *
 *   # Connect to playground: https://agents-playground.livekit.io
 */
import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  inference,
  llm,
  voice,
} from '@livekit/agents';
import * as livekit from '@livekit/agents-plugin-livekit';
import * as silero from '@livekit/agents-plugin-silero';
import { Composio } from '@composio/core';
import { LivekitProvider } from '@composio/livekit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: '.env' });

// Initialize Composio with the LiveKit provider
const provider = new LivekitProvider();
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider,
});

/**
 * Voice Agent with Composio tools integration
 *
 * This agent can:
 * - Fetch emails from Gmail
 * - Search HackerNews posts
 * - Interact with other Composio-supported services
 */
class ComposioAssistant extends voice.Agent {
  constructor(tools: llm.ToolContext) {
    super({
      instructions: `You are a helpful voice AI assistant with access to various tools.
        You can help users with tasks like:
        - Searching for posts on HackerNews
        - And more based on the tools available to you.

        Your responses should be concise and conversational since users are interacting via voice.
        Avoid complex formatting, emojis, or long lists in your responses.
        Be friendly, helpful, and to the point.`,
      tools,
    });
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Pre-load the VAD model for faster startup
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const vad = ctx.proc.userData.vad as silero.VAD;

    console.log('Fetching Composio tools...');

    // Get Composio tools wrapped for LiveKit
    // You can customize which tools to fetch based on your use case
    const tools = await composio.tools.get('default', 'HACKERNEWS_GET_FRONT_PAGE_POSTS');

    console.log(`Loaded ${Object.keys(tools).length} Composio tool(s):`, Object.keys(tools));

    // Create the voice agent with Composio tools
    // Cast is needed because @composio/livekit uses its own @livekit/agents instance
    // which has different unique symbols than this package's instance
    const agent = new ComposioAssistant(tools);

    // Set up the voice AI session with STT, LLM, and TTS
    const session = new voice.AgentSession({
      // Speech-to-text: Converts user's voice to text
      stt: new inference.STT({
        model: 'assemblyai/universal-streaming',
        language: 'en',
      }),

      // Large Language Model: Processes input and generates responses
      llm: new inference.LLM({
        model: 'openai/gpt-4.1-mini',
        apiKey: process.env.OPENAI_API_KEY,
      }),

      // Text-to-speech: Converts LLM responses to voice
      tts: new inference.TTS({
        model: 'cartesia/sonic-3',
        voice: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
      }),

      // Voice Activity Detection and turn detection
      vad,
      turnDetection: new livekit.turnDetector.MultilingualModel(),
    });

    // Start the session
    await session.start({
      agent,
      room: ctx.room,
    });

    // Connect to the room
    await ctx.connect();

    // Generate an initial greeting
    session.generateReply({
      instructions: 'Greet the user warmly and let them know you can help them search HackerNews or perform other tasks. Ask how you can assist them today.',
    });
  },
});

// Run the agent
cli.runApp(new ServerOptions({
  // agentName: 'composio-livekit-example',
  agent: fileURLToPath(import.meta.url),
}));
