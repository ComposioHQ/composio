/**
 * Anthropic Messages API adapter.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { SHELL_TOOL, type ModelAdapter, type ModelTurn } from './agent';

const ShellInput = z.object({ command: z.string() });

export const anthropicAdapter = (options: {
  baseURL: string;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
}): ModelAdapter => {
  // No retries: a miss in strict replay, or a live failure while recording, must surface once.
  const client = new Anthropic({ baseURL: options.baseURL, apiKey: options.apiKey, maxRetries: 0 });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: options.prompt }];

  return {
    provider: 'anthropic',
    model: options.model,
    next: async (): Promise<ModelTurn> => {
      const response = await client.messages.create({
        model: options.model,
        max_tokens: options.maxTokens,
        // The run without the skill has no system prompt at all.
        ...(options.system === '' ? {} : { system: options.system }),
        tools: [
          {
            name: SHELL_TOOL.name,
            description: SHELL_TOOL.description,
            input_schema: SHELL_TOOL.parameters,
          },
        ],
        messages,
      });
      // The whole content goes back unchanged, thinking blocks included.
      messages.push({ role: 'assistant', content: response.content });

      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
      const calls = response.content
        .filter(block => block.type === 'tool_use')
        .map(block => ({ id: block.id, command: ShellInput.parse(block.input).command }));

      const continues = response.stop_reason === 'tool_use' || response.stop_reason === 'end_turn';
      return { text, calls, stopped: continues ? undefined : (response.stop_reason ?? 'unknown') };
    },
    record: results => {
      messages.push({
        role: 'user',
        content: results.map(({ call, payload }) => ({
          type: 'tool_result' as const,
          tool_use_id: call.id,
          content: payload,
        })),
      });
    },
    say: message => {
      messages.push({ role: 'user', content: message });
    },
  };
};
