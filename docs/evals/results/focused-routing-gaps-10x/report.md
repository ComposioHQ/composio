# Composio docs before/after benchmark

- Before: https://docs.composio.dev
- After: https://docs-git-docs-intent-based-ia.preview.composio.dev
- Scenarios: 2
- Trials per target: 10
- Model scenario executions: 40
- Scoring version: 2

- Before runtime: inception/mercury-2 @ 13cba53b1d1d88eb9f54b740735fcd33534e0eb5
- After runtime: inception/mercury-2 @ a95a67ca621e0240ae46d992e2b2aa85a7b7f487

## Model scores

| Dimension | Before | After | Delta |
| --- | ---: | ---: | ---: |
| execution | 100.0% | 100.0% | 0.0% |
| content | 72.5% | 100.0% | 27.5% |
| route | 0.0% | 100.0% | 100.0% |
| citation | 0.0% | 95.0% | 95.0% |
| efficiency | 60.0% | 100.0% | 40.0% |
| overall | 46.5% | 99.0% | 52.5% |
| average tool calls | 2.20 | 0.00 | -2.20 |
| average latency | 8.3s | 1.2s | -7.1s |

## Scenario results

| Scenario | Category | Before | After | Route before/after |
| --- | --- | ---: | ---: | ---: |
| Connect an existing MCP client | start-and-route | 51.0% | 100.0% | 0.0% / 100.0% |
| Find the exact tools.execute implementation guide | legacy-and-safety | 42.0% | 98.0% | 0.0% / 100.0% |

## Review notes

- Dimension failures across all trials: 21
- Full final answers and failure reasons are in `results.json`.
- Quickstart live execution is intentionally not run: it needs dedicated credentials and a disposable GitHub target because the documented action mutates external state.
- The same scenarios can be handed to human testers; use route found, completion, time, and wrong turns as the human rubric.
