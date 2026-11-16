import type { ModelAdapter } from './agent';
import { anthropicAdapter } from './anthropic-adapter';
import type { Provider } from './fixtures';
import { openaiAdapter } from './openai-adapter';
import type { AdapterInputs } from './run-journey';

/**
 * Per-turn output cap. Enough for a command and a sentence around it, with
 * room for the thinking current models cannot switch off.
 */
export const MAX_OUTPUT_TOKENS = 2048;

/**
 * The key the adapters send. It only ever reaches the local aimock: in replay
 * nothing is forwarded, and in record mode aimock swaps a key with this prefix
 * for the real one on the way out.
 */
export const PLACEHOLDER_API_KEY = 'sk-aimock-composio-e2e';

export const adapterFor =
  (provider: Provider, model: string, baseURL: string) =>
  (inputs: AdapterInputs): ModelAdapter => {
    const options = {
      baseURL,
      apiKey: PLACEHOLDER_API_KEY,
      model,
      maxTokens: MAX_OUTPUT_TOKENS,
      ...inputs,
    };
    return provider === 'anthropic' ? anthropicAdapter(options) : openaiAdapter(options);
  };
