/**
 * OpenAI Chat Completions adapter.
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { SHELL_TOOL, type ModelAdapter, type ModelTurn } from './agent';

const ShellInput = z.object({ command: z.string() });

export const openaiAdapter = (options: {
  baseURL: string;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
}): ModelAdapter => {
  const client = new OpenAI({
    baseURL: `${options.baseURL}/v1`,
    apiKey: options.apiKey,
    maxRetries: 0,
  });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: options.system },
    { role: 'user', content: options.prompt },
  ];

  return {
    provider: 'openai',
    model: options.model,
    next: async (): Promise<ModelTurn> => {
      const response = await client.chat.completions.create({
        model: options.model,
        max_completion_tokens: options.maxTokens,
        tools: [{ type: 'function', function: SHELL_TOOL }],
        messages,
      });
      const choice = response.choices[0];
      if (!choice) return { text: '', calls: [], stopped: 'no-choice' };
      messages.push(choice.message);

      const calls = (choice.message.tool_calls ?? [])
        .filter(call => call.type === 'function')
        .map(call => ({
          id: call.id,
          command: ShellInput.parse(JSON.parse(call.function.arguments)).command,
        }));
      const continues = choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop';
      return {
        text: choice.message.content ?? '',
        calls,
        stopped: continues ? undefined : choice.finish_reason,
      };
    },
    record: results => {
      for (const { call, payload } of results) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: payload });
      }
    },
    say: message => {
      messages.push({ role: 'user', content: message });
    },
  };
};
