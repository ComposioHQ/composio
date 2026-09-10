# Change the Composio docs

Use a pull request for a specific docs fix. Use a Developer Marketing issue in Linear with the Docs label when the work needs investigation, coordination, or a larger content plan. Link the issue and its source context in the PR so the reviewer can check the original problem.

For a runtime bug, include a reproducible example and involve the SDK or platform owner. A docs change cannot establish behavior that the product does not support.

## Choose the source

| Change | Edit |
| --- | --- |
| A guide or explanation | `content/docs/` |
| An application example | `content/examples/` |
| A release note | `content/changelog/` and the [changelog guide](agent-guidance/guides/changelog.md) |
| Sidebar order | The nearest `meta.json`; product navigation also uses `lib/home-navigation.ts` |
| Page layout or an MDX component | `app/`, `components/`, or `lib/` |
| API or SDK reference, toolkit data | The owning source or generator; do not patch generated output by hand |
| A public support answer | The [knowledge publication workflow](decisions/public-knowledge-base.md) |

Read [AGENTS.md](AGENTS.md) for repository rules. For typed code examples, read the [Twoslash guide](agent-guidance/context/twoslash.md). Check the [docs decisions](decisions/README.md) before changing an established architecture or content pipeline.

## Prepare a change

1. Find the existing page and search for related issues or PRs. Extend the canonical page when it already covers the topic.
2. Branch from the latest `origin/next`. Target the PR at `next`.
3. Reproduce the problem or write down the reader's task and the expected result. Include the affected URL and source evidence.
4. Verify API behavior against SDK code, the current API schema, or a reproducible request. For an unresolved product or architecture question, get confirmation from the responsible team before documenting a recommendation.
5. Make the smallest complete change. Use relative site links, add new pages to navigation, and preserve the Markdown representation of task-critical content.

From the repository root, install the pinned toolchain with `mise install`. Then run the docs commands from `docs/`:

```bash
bun install
bun run dev
```

Open the changed page at `http://localhost:3000`. Inspect its layout, links, and code examples. Also inspect its `.md` URL if the change contains commands, warnings, component content, or navigation.

## Validate the PR

Run these checks from `docs/`:

```bash
bun run test
bun run lint
bun run lint:links
bun run types:check
bun run check:kb-semantic
bun run build
```

To check the built site's endpoints, run `bun run start` in one terminal and `bun run test:integration` in another. The integration tests use `http://localhost:3000` by default. Set `TEST_BASE_URL` if your server uses another address.

A stale KB semantic artifact can follow a content change. The `Docs - Rebuild KB Semantic Artifact` workflow can rebuild it for eligible same-repository PRs after `Docs - Tests` runs. Check that workflow's result and rerun failed checks against the updated commit. If you rebuild locally with `bun run build:kb-semantic`, use an authorized `OPENAI_API_KEY`: the generator sends the indexed docs content to the embeddings service. Never edit embedding values or content hashes by hand.

## Request review and verify publication

Describe the reader's problem, the resulting behavior, and the checks you ran. Include screenshots for visual changes and list checks that failed or could not run. Link the Linear issue when one exists. Docs-only changes do not need a Changeset.

Request review from someone who can verify the changed topic. Involve the product owner for behavior, security, tenancy, or contractual claims. Follow the repository's review and merge requirements; a passing build alone does not verify those claims.

After merge, confirm the deployment succeeds and inspect the live page and `.md` representation. Check `Docs - Sync Algolia Search` for changes that affect retrieval. Update the linked issue with the published result once the change is verified. If the live result is wrong, report the affected URL and commit so the next fix starts from evidence.
