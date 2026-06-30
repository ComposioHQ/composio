import { createOpenAI } from '@ai-sdk/openai';
import { defineAgent } from 'eve';
import type { AgentModelDefinition, AgentModelOptionsDefinition } from 'eve';

const INCEPTION_BASE_URL = process.env.INCEPTION_BASE_URL ?? 'https://api.inceptionlabs.ai/v1';
const INCEPTION_MODEL = process.env.INCEPTION_MODEL ?? 'mercury-2';
const DOCS_AGENT_GATEWAY_MODEL = process.env.DOCS_AGENT_GATEWAY_MODEL ?? 'openai/gpt-5.4-mini';
const DOCS_AGENT_MODEL_FLOW = process.env.DOCS_AGENT_MODEL_FLOW ?? 'mercury';

type DocsAgentModelConfig = {
  model: AgentModelDefinition;
  modelContextWindowTokens?: number;
  modelOptions?: AgentModelOptionsDefinition;
};

const resolveInceptionApiKey = () => {
  const apiKey = process.env.INCEPTION_API_KEY;

  if (!apiKey) {
    throw new Error('INCEPTION_API_KEY is required to run the docs agent with Inception Mercury.');
  }

  return apiKey;
};

const inception = createOpenAI({
  name: 'inception',
  baseURL: INCEPTION_BASE_URL,
  // The OpenAI-compatible AI SDK provider otherwise falls back to OPENAI_API_KEY
  // when apiKey is undefined. Keep the actual Mercury key runtime-resolved so we
  // never accidentally send an OpenAI key to Inception's endpoint.
  apiKey: 'runtime-resolved-by-inception-fetch',
  fetch: async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${resolveInceptionApiKey()}`);

    return fetch(input, { ...init, headers });
  },
});

const gatewayModel = (model: string): AgentModelDefinition => {
  // Eve supports AI Gateway model id strings here. Cast until the published
  // type catches up with the documented `defineAgent({ model: "provider/model" })`
  // gateway path.
  return model as unknown as AgentModelDefinition;
};

const resolveDocsAgentModel = (): DocsAgentModelConfig => {
  switch (DOCS_AGENT_MODEL_FLOW) {
    case 'gateway':
      return {
        model: gatewayModel(DOCS_AGENT_GATEWAY_MODEL),
      };
    case 'mercury':
      return {
        // Use the chat-completions path because Mercury exposes tool calling there.
        model: inception.chat(INCEPTION_MODEL),
        // Mercury 2's chat context window is 128K tokens.
        modelContextWindowTokens: 128_000,
        modelOptions: {
          providerOptions: {
            openai: {
              // Mercury supports tool calling and the OpenAI-compatible adapter
              // maps this to `reasoning_effort`. `medium` is Inception's
              // recommended default and is accepted by the AI SDK OpenAI provider
              // schema.
              reasoningEffort: 'medium',
            },
          },
        },
      };
    default:
      throw new Error(
        `Unsupported DOCS_AGENT_MODEL_FLOW "${DOCS_AGENT_MODEL_FLOW}". Expected "mercury" or "gateway".`
      );
  }
};

const docsAgentModel = resolveDocsAgentModel();

/**
 * Eve — the Composio docs assistant.
 *
 * Runs inside the docs Next.js app (mounted via `withEve` in next.config.mjs)
 * and answers questions grounded in the docs. The `search_docs` tool returns
 * doc snippets and their URLs so Eve can cite and link specific pages.
 *
 * Model: defaults to Inception Labs Mercury 2 diffusion model through the
 * OpenAI-compatible chat endpoint. Set `INCEPTION_API_KEY` locally and in the
 * preview environment.
 *
 * Evaluation / A-B knobs:
 *
 * - `DOCS_AGENT_MODEL_FLOW=mercury` (default) uses Inception Mercury.
 * - `DOCS_AGENT_MODEL_FLOW=gateway` uses the Vercel AI Gateway fallback.
 * - `INCEPTION_MODEL` (default: `mercury-2`)
 * - `INCEPTION_BASE_URL` (default: `https://api.inceptionlabs.ai/v1`)
 * - `DOCS_AGENT_GATEWAY_MODEL` (default: `openai/gpt-5.4-mini`)
 */
export default defineAgent({
  model: docsAgentModel.model,
  modelContextWindowTokens: docsAgentModel.modelContextWindowTokens,
  modelOptions: docsAgentModel.modelOptions,
});
