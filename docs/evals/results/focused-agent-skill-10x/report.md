# Composio docs before/after benchmark

- Before: https://docs.composio.dev
- After: https://docs-git-docs-intent-based-ia.preview.composio.dev
- Scenarios: 1
- Trials per target: 10
- Model scenario executions: 20
- Scoring version: 2

- Before runtime: inception/mercury-2 @ 13cba53b1d1d88eb9f54b740735fcd33534e0eb5
- After runtime: inception/mercury-2 @ a2b6e5b1e0a694b92e0db6f5dd04a3b447726d15

## Model scores

| Dimension | Before | After | Delta |
| --- | ---: | ---: | ---: |
| execution | 100.0% | 100.0% | 0.0% |
| content | 100.0% | 100.0% | 0.0% |
| route | 0.0% | 100.0% | 100.0% |
| citation | 0.0% | 100.0% | 100.0% |
| efficiency | 100.0% | 100.0% | 0.0% |
| overall | 60.0% | 100.0% | 40.0% |
| average tool calls | 0.30 | 0.00 | -0.30 |
| average latency | 2.0s | 1.4s | -0.6s |

## Scenario results

| Scenario | Category | Before | After | Route before/after |
| --- | --- | ---: | ---: | ---: |
| Install Composio as an agent skill | start-and-route | 60.0% | 100.0% | 0.0% / 100.0% |

## Review notes

- Dimension failures across all trials: 10
- Full final answers and failure reasons are in `results.json`.
- Quickstart live execution is intentionally not run: it needs dedicated credentials and a disposable GitHub target because the documented action mutates external state.
- The same scenarios can be handed to human testers; use route found, completion, time, and wrong turns as the human rubric.
