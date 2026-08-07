# Evaluation review

## What this benchmark tested

The benchmark used 30 fixed scenarios:

- 12 start-and-route scenarios: vague onboarding, Python, TypeScript, framework choice, plugin/CLI preference, agent skills, Codex, and explicit MCP paths
- 12 find-and-change scenarios: authentication, custom OAuth, scopes, multiple accounts, session tools, triggers, sandboxes, custom tools, proxy execution, and migrations
- 4 build-example scenarios: Slack standup bot, local PR reviewer, iMessage agent, and LangChain
- 2 legacy-and-safety scenarios: explicitly requested direct execution and an out-of-scope billing action

Each scenario ran 5 times against canonical production and 5 times against the PR preview: 300 model executions total. Both targets used `inception/mercury-2`. The runtime build identities prove the comparison was production at `13cba53b` versus the PR iteration at `f4267aba`.

## Scoring

The runner keeps five dimensions separate:

| Dimension | What counts |
| --- | --- |
| Execution | The docs agent completes without a failed action. |
| Content | Required scenario concepts appear in the answer. Partial matches receive partial credit. |
| Route | The answer selects an accepted route and avoids explicitly wrong routes. |
| Citation | The answer provides a Markdown docs/example/reference link. |
| Efficiency | The answer stays inside the scenario's tool-call budget. |

The deterministic site audit separately checks endpoint status, sitemap and `llms.txt` inclusion, content-link reachability, `llms-full.txt`, and Quickstart Python syntax. A single-reviewer browser pass checks visible navigation without search.

## Results

| Dimension | Canonical | Preview | Change |
| --- | ---: | ---: | ---: |
| Execution | 100.0% | 100.0% | 0.0 points |
| Content | 92.0% | 96.7% | +4.7 points |
| Route | 88.0% | 90.7% | +2.7 points |
| Citation | 89.7% | 91.0% | +1.4 points |
| Efficiency | 98.7% | 100.0% | +1.3 points |
| Overall | 93.7% | 95.7% | +2.0 points |
| Average tool calls | 0.31 | 0.17 | -0.14 |
| Average latency | 1.8s | 1.4s | -0.3s |

The largest clear win is vague onboarding. Canonical never selected the Welcome route or explained the build/use split; the preview selected it in 5/5 trials and reached 98% overall on that scenario.

The crawl and navigation structure also improved:

- scenario routes in `llms.txt`: 88.9% to 96.3%
- scenario routes reachable from Welcome content links: 3.7% to 59.3%
- human-style navigation to the intended internal page: 6/8 to 8/8 tasks
- scenario Markdown endpoints and sitemap entries: 100% on both targets

## Remaining gaps

1. **Codex without explicit MCP:** preview route score is 0/5. Answers usually recommend building an SDK application, while the desired path is the CLI or installable skill. The skill does not need to be on Welcome, but its route needs stronger agent-facing retrieval and guidance.
2. **Existing MCP client:** preview chooses Composio Connect in only 1/5 trials. The agent usually confuses a ready-made client connection with creating an SDK session using `mcp: true`. The two MCP intents need sharper descriptions and guardrails.
3. **Explicit legacy direct execution:** both targets choose the migration or sessions-versus-direct overview instead of `/docs/tools-direct/executing-tools`. Human navigation can reach the exact page after one disclosure, but agent retrieval does not.
4. **Use Composio ordering:** the preview exposes the plugin, CLI, and MCP paths, but generic MCP is still first. The requested hierarchy is plugin/CLI first, with MCP easy to find only when explicitly requested.
5. **Citation formatting:** most residual failures are valid paths rendered as plain text or malformed Markdown. This is stochastic response formatting, separate from content or route selection.

## What was not fully tested

- The Quickstart's Python blocks compile, but the documented GitHub action was not executed. A live run needs dedicated Composio credentials and a disposable GitHub target because it changes external state.
- The browser pass used one reviewer and click counts. It is not a moderated study with multiple users, time-to-completion, confidence, or qualitative notes.
- The model benchmark used one deployed model and fixed prompts. It did not yet test other agent models, paraphrased prompts, typos, or multi-turn follow-ups.
- `llms-full.txt` was checked for availability and size, while scenario route coverage was checked through `llms.txt` and Markdown endpoints. A page-by-page `llms-full` completeness and duplicate-content audit would add stronger corpus coverage.
- The benchmark does not yet execute code from the framework guides or example pages.

## Recommended CI rollout

1. Add a blocking deterministic job after the preview deploy: endpoint status, sitemap/`llms.txt` coverage, content-link reachability, link checks, and Quickstart syntax.
2. Add a manually dispatched model workflow with preview URL and trial count inputs; default to one trial and upload the benchmark plus Eve artifacts.
3. Add a scheduled 5-trial production-versus-main run after model credentials and spend limits are approved.
4. Track route/content scores and variance, but do not block pull requests on one stochastic answer. Block only on repeated route regressions or deterministic failures.
5. Add an opt-in live Quickstart job using a dedicated test project and disposable GitHub repository.

The current PR includes the rerunnable local workflow and report artifacts. It intentionally does not add a GitHub workflow yet because preview URL handoff, model secrets, cost limits, and the live-action test account still need owners.

