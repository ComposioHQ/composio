import { defineEvalConfig } from 'eve/evals';

export default defineEvalConfig({
  maxConcurrency: 2,
  timeoutMs: 90_000,
});
