---
description: Full CLI test pipeline — monitor CI for types/lint, then run local binary test, then run bundled binary test via CI.
---

# Full CLI Test

End-to-end CLI validation pipeline that ensures types/lint pass in CI, then tests the CLI binary built from source, and finally tests the CI-bundled binary.

## Overview

This skill runs three phases sequentially:

1. **Phase 1: CI Lint/Type Check** — Poll CI until the CLI type-check and lint jobs pass.
2. **Phase 2: Local Binary Test** — Build and test the CLI binary from source (`/cli-test`).
3. **Phase 3: Bundled Binary Test** — Trigger CI binary build, download, and test (`/cli-test-with-bundling`).

## Phase 1: Monitor CI for Types/Lint

Use `/loop 5m` to poll the CI status for the current branch every 5 minutes. Check that **all type-check and lint jobs pass** for the CLI package before proceeding.

### How to check

```bash
# Get the latest CI run for the current branch
gh run list \
  --repo ComposioHQ/composio \
  --branch "$(git rev-parse --abbrev-ref HEAD)" \
  --limit 5 \
  --json databaseId,status,conclusion,name,headBranch
```

Look for workflow runs that cover type-checking and linting (e.g., the main CI workflow). If none are running or completed yet, wait for one to appear.

### What to verify

- All type-check jobs: **pass**
- All lint jobs: **pass**
- If any fail, report the failure to the user and stop — do NOT proceed to Phase 2.

Use `/loop 5m` to poll: run the `gh run list` / `gh run view` command every 5 minutes until the relevant jobs succeed. Once all type/lint checks are green, move on.

## Phase 2: Local Binary Test (`/cli-test`)

Once CI lint/types pass, run the `/cli-test` skill:

1. Install dependencies: `pnpm install`
2. Build all packages: `pnpm turbo build`
3. Build the standalone binary: `pnpm --dir ts/packages/cli build:binary`
4. Test the binary:
   ```bash
   ./ts/packages/cli/dist/composio version
   ./ts/packages/cli/dist/composio whoami
   ./ts/packages/cli/dist/composio --help
   ```
5. Run the Slack integration test (see [Slack Integration Test](#slack-integration-test) below):
   ```bash
   ./ts/packages/cli/dist/composio run '<SLACK_TEST_SCRIPT>'
   ```

If any command fails, report to the user and stop — do NOT proceed to Phase 3.

## Phase 3: Bundled Binary Test (`/cli-test-with-bundling`)

Once the local binary test passes, run the `/cli-test-with-bundling` skill:

1. Read the version from `ts/packages/cli/package.json` and append a `-beta.<timestamp>` suffix (e.g. `1.2.3-beta.20260331143022`) — **always trigger as a beta release**
2. Trigger the `build-cli-binaries.yml` workflow via `gh workflow run` with the beta version
3. Monitor the workflow run (use `/loop 5m` to poll)
4. Download the platform-appropriate binary artifact
5. Test the binary:
   ```bash
   $BINARY version
   $BINARY whoami
   $BINARY --help
   $BINARY run 'console.log("hello from composio run")'
   $BINARY run 'const result = await experimental_subAgent({ goal: "What is 2+2?", toolNames: [] }); console.log(result)'
   ```
6. Run the Slack integration test (see [Slack Integration Test](#slack-integration-test) below):
   ```bash
   $BINARY run '<SLACK_TEST_SCRIPT>'
   ```
7. If on a PR, post results as a PR comment

## Slack Integration Test

This test validates `execute()`, `experimental_subAgent()`, and end-to-end Slack connectivity. It must be run in **both Phase 2 and Phase 3** to ensure it works with both the locally-built and CI-bundled binaries.

### Channel

**`#buzz-skill-based-cli-testing`** — dedicated Slack channel for automated CLI test runs.

### Test Script

Use `composio run` (or `$BINARY run` in Phase 3) with the following script. Replace `$BINARY` with the appropriate binary path for the phase.

```bash
$BINARY run '
  // Step 1: Find the #buzz-skill-based-cli-testing channel
  const channels = await execute("SLACK_LIST_CHANNELS", {
    types: "public_channel",
    limit: 200,
  });
  const channel = channels.data?.channels?.find(
    (c) => c.name === "buzz-skill-based-cli-testing"
  );
  if (!channel) throw new Error("Channel #buzz-skill-based-cli-testing not found");

  // Step 2: Send an initial message tagging @cryogenicplanet
  const buildType = "local";  // use "bundled" in Phase 3
  await execute("SLACK_SEND_A_MESSAGE_TO_A_SLACK_CHANNEL", {
    channel: channel.id,
    text: `<@cryogenicplanet> CLI test run started (${buildType} build) at ${new Date().toISOString()}`,
  });

  // Step 3: Fetch recent channel history for the subAgent to summarize
  const history = await execute("SLACK_GET_CHANNEL_HISTORY", {
    channel: channel.id,
    limit: 20,
  });

  // Step 4: Use experimental_subAgent to summarize what happened in the channel
  const summary = await experimental_subAgent(
    `Summarize the recent activity in this Slack channel in 2-3 sentences. Focus on what tests were run and their outcomes.\n\n${history.prompt()}`,
    {
      schema: z.object({
        summary: z.string(),
        messageCount: z.number(),
      }),
    }
  );

  // Step 5: Post the summary back to the channel
  await execute("SLACK_SEND_A_MESSAGE_TO_A_SLACK_CHANNEL", {
    channel: channel.id,
    text: `CLI Test Summary (${buildType} build):\n${summary.structuredOutput.summary}\n(${summary.structuredOutput.messageCount} messages analyzed)`,
  });

  console.log("Slack integration test passed:", summary.structuredOutput);
'
```

### What this validates

| Capability | How it's tested |
|---|---|
| `execute()` with Slack tools | List channels, send messages, fetch history |
| `experimental_subAgent()` | Summarizes channel history with structured output via `z` schema |
| `z` (Zod) global | Used in the subAgent schema definition |
| `result.prompt()` | Feeds channel history into the subAgent |
| End-to-end Slack connectivity | Reads from and writes to a real Slack channel |

### Important Notes

- Change `buildType` to `"bundled"` when running in Phase 3.
- The Slack user tag `<@cryogenicplanet>` should resolve to the correct user in your workspace. If the mention doesn't resolve, find the Slack user ID first and use `<@U_XXXXX>` format.
- This test requires an active Slack connection in Composio. If not connected, run `composio connect slack` first.

## Failure Handling

- **Phase 1 failure (lint/types):** Report which jobs failed with links. Do not continue.
- **Phase 2 failure (local build/test):** Report the error output. Do not continue.
- **Phase 3 failure (bundled build/test):** Report which commands failed. Post results to PR if applicable.

## Reference Files

| File | Purpose |
|---|---|
| `.github/workflows/build-cli-binaries.yml` | CI workflow that builds binaries |
| `ts/packages/cli/package.json` | Source of CLI version |
| `ts/packages/cli/scripts/build-binary.ts` | Local binary build script |
| `ts/packages/cli/dist/composio` | Built binary output |
