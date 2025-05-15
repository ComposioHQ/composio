import { Composio } from '@composio/core';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { VercelToolset } from '@composio/vercel';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new VercelToolset(),
  // userId: process.env.COMPOSIO_USER_ID, // pass the user at the global level
});

/**
