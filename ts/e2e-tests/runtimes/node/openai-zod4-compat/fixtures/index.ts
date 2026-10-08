import OpenAI from 'openai';
import { OpenAIProvider, type Tool } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';

const composioTool = {
  slug: 'TEST_TOOL',
  name: 'Test Tool',
  description: 'A tool used by the OpenAI compatibility fixture',
  version: '20260625_00',
  availableVersions: ['20260625_00'],
  inputParameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
  },
  tags: [],
} satisfies Tool;

const chatProvider = new OpenAIProvider();
const chatTool = chatProvider.wrapTool(composioTool);
const _openAIChatTool: OpenAI.ChatCompletionTool = chatTool;

const responsesProvider = new OpenAIResponsesProvider();
const responsesTool = responsesProvider.wrapTool(composioTool);
const _openAIResponsesTool: OpenAI.Responses.FunctionTool = responsesTool;

type ProviderToolCall = Parameters<OpenAIResponsesProvider['executeToolCall']>[1];
declare const openAIToolCall: OpenAI.Responses.ResponseFunctionToolCall;
const _providerToolCall: ProviderToolCall = openAIToolCall;
