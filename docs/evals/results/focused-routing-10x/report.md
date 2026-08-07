# Composio docs before/after benchmark

- Before: https://docs.composio.dev
- After: https://docs-git-docs-intent-based-ia.preview.composio.dev
- Scenarios: 7
- Trials per target: 10
- Model scenario executions: 140
- Scoring version: 2

- Before runtime: inception/mercury-2 @ 13cba53b1d1d88eb9f54b740735fcd33534e0eb5
- After runtime: inception/mercury-2 @ 5f56761178fad773f065ec86f6bdc23cfec38fac

## Model scores

| Dimension | Before | After | Delta |
| --- | ---: | ---: | ---: |
| execution | 100.0% | 100.0% | 0.0% |
| content | 68.6% | 92.1% | 23.6% |
| route | 41.4% | 72.9% | 31.4% |
| citation | 40.0% | 67.1% | 27.1% |
| efficiency | 85.7% | 92.9% | 7.1% |
| overall | 67.1% | 85.0% | 17.9% |
| average tool calls | 1.09 | 0.56 | -0.53 |
| average latency | 4.8s | 3.6s | -1.2s |

## Scenario results

| Scenario | Category | Before | After | Route before/after |
| --- | --- | ---: | ---: | ---: |
| Prefer the Claude Code plugin or CLI | start-and-route | 100.0% | 100.0% | 100.0% / 100.0% |
| Prefer the native plugin for Codex | start-and-route | 51.0% | 98.0% | 0.0% / 100.0% |
| Install the Codex plugin directly | start-and-route | 40.0% | 100.0% | 0.0% / 100.0% |
| Connect Cursor when MCP is explicit | start-and-route | 95.0% | 100.0% | 90.0% / 100.0% |
| Connect an existing MCP client | start-and-route | 50.0% | 55.0% | 0.0% / 10.0% |
| Expose an application session over MCP | start-and-route | 98.0% | 93.0% | 100.0% / 100.0% |
| Find the exact tools.execute implementation guide | legacy-and-safety | 36.0% | 49.0% | 0.0% / 0.0% |

## Review notes

- Dimension failures across all trials: 66
- Full final answers and failure reasons are in `results.json`.
- Quickstart live execution is intentionally not run: it needs dedicated credentials and a disposable GitHub target because the documented action mutates external state.
- The same scenarios can be handed to human testers; use route found, completion, time, and wrong turns as the human rubric.
