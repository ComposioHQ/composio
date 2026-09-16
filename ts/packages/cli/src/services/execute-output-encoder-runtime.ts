// Entry point of the `execute-output-encoder-runtime` companion module: the
// tokenizer `composio execute` uses to decide whether a large response is
// printed inline or stored to a file, bundled into
// `dist/execute-output-encoder-runtime.mjs` next to the executable. The o200k
// rank table is a 2.3MB string literal that would otherwise sit in the
// executable for every command, while only responses past the inline threshold
// ever need it. See `RUN_COMPANION_MODULE_BASENAMES`.
//
// The CLI loads this file with
// `loadInstalledCompanionModule('execute-output-encoder-runtime')`. It exposes
// plain functions on purpose; see `generation-runtime.ts` for why nothing
// Effect-shaped crosses a companion boundary.
import { Tiktoken } from 'js-tiktoken/lite';
import o200kBase from 'js-tiktoken/ranks/o200k_base';

let executeOutputEncoder: Tiktoken | undefined;

const getExecuteOutputEncoder = () => {
  if (!executeOutputEncoder) {
    executeOutputEncoder = new Tiktoken(o200kBase);
  }
  return executeOutputEncoder;
};

// `Tiktoken.encode` defaults `disallowedSpecial` to "all", which makes it throw
// on any tool response that happens to contain the literal text `<|endoftext|>`
// or `<|endofprompt|>` (a README about tokenizers is enough). Here the encoder
// is only a length gauge, so passing `allowedSpecial: 'all'` counts each literal
// as the single special token it encodes to instead of rejecting the payload.
export const countOutputTokens = (json: string): number =>
  getExecuteOutputEncoder().encode(json, 'all').length;
