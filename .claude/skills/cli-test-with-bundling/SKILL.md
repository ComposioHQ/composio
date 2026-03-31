---
description: Trigger a CI binary build via workflow dispatch, monitor it, download the artifact, and test the CLI binary locally.
---

# CLI Test with Bundling (CI)

Trigger the `Build CLI Binaries` workflow on GitHub Actions, wait for it to complete, download the built binary for the current platform, and test it locally.

## Prerequisites

- `gh` CLI authenticated with access to `ComposioHQ/composio`
- Current branch pushed to the remote

## Step 1: Determine the version

Read the version from `ts/packages/cli/package.json`:

```bash
jq -r .version ts/packages/cli/package.json
```

## Step 2: Trigger the workflow

```bash
gh workflow run build-cli-binaries.yml \
  --repo ComposioHQ/composio \
  --ref "$(git rev-parse --abbrev-ref HEAD)" \
  --field version="<version-from-step-1>"
```

## Step 3: Find and monitor the run

After triggering, wait a few seconds then find the run:

```bash
gh run list \
  --repo ComposioHQ/composio \
  --workflow build-cli-binaries.yml \
  --limit 1 \
  --json databaseId,status,headBranch
```

Then watch it until completion:

```bash
gh run watch <run-id> --repo ComposioHQ/composio
```

Alternatively, use `/loop 5m gh run view <run-id> --repo ComposioHQ/composio` to poll the workflow status every 5 minutes while you continue other work.

## Step 4: Download and install the binary

Once the run succeeds, determine the platform artifact name:

| Platform        | Artifact name            |
|-----------------|--------------------------|
| macOS ARM64     | composio-darwin-aarch64  |
| macOS x64       | composio-darwin-x64      |
| Linux x64       | composio-linux-x64       |
| Linux ARM64     | composio-linux-aarch64   |

Detect the right one automatically:

```bash
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  arm64|aarch64) ARCH="aarch64" ;;
  x86_64) ARCH="x64" ;;
esac
ARTIFACT="composio-${OS}-${ARCH}"
```

Then download from the release. The workflow creates a GitHub release tagged `@composio/cli@<version>`:

```bash
VERSION="<version-from-step-1>"
TAG="@composio/cli@${VERSION}"
ENCODED_TAG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${TAG}', safe=''))")

mkdir -p /tmp/composio-prerelease-test && cd /tmp/composio-prerelease-test \
  && curl -L -o "${ARTIFACT}.zip" \
    "https://github.com/ComposioHQ/composio/releases/download/${ENCODED_TAG}/${ARTIFACT}.zip" \
  && unzip -o "${ARTIFACT}.zip" \
  && ./${ARTIFACT}/composio --version
```

Alternatively, download the artifact directly from the workflow run (doesn't require waiting for the release job):

```bash
gh run download <run-id> \
  --repo ComposioHQ/composio \
  --name "${ARTIFACT}" \
  --dir /tmp/composio-prerelease-test

cd /tmp/composio-prerelease-test && unzip -o "${ARTIFACT}.zip" && ./${ARTIFACT}/composio --version
```

## Step 5: Test the binary

Run commands against the downloaded binary:

```bash
BINARY="/tmp/composio-prerelease-test/${ARTIFACT}/composio"

$BINARY version
$BINARY whoami
$BINARY --help
```

### Critical: Test `run` and `subAgent`

`composio run` and `experimental_subAgent()` inside `run` have complex bundling — they spawn child Bun processes using companion modules that live outside the compiled binary. These are the most likely commands to break in a bundled build. Always test them explicitly:

```bash
# Test composio run with a simple inline script
$BINARY run 'console.log("hello from composio run")'

# Test composio run with subAgent (requires OPENAI_API_KEY or similar)
$BINARY run 'const result = await experimental_subAgent({ goal: "What is 2+2?", toolNames: [] }); console.log(result)'
```

If either of these fails, the companion module bundling is broken — check `ts/packages/cli/scripts/build-binary.ts` and the `buildCompanionModules` function.

### Auth

By default, the binary uses your existing Composio CLI auth (stored in `~/.composio/user-config.json`). No extra setup needed.

### Testing against staging or preview environments

To test against staging:

```bash
export COMPOSIO_BASE_URL=https://staging-backend.composio.dev
export COMPOSIO_WEB_URL=https://staging-platform.composio.dev
```

Or shorthand:

```bash
export COMPOSIO_ENVIRONMENT=staging
```

For a preview environment, set the URLs to the preview backend and dashboard:

```bash
export COMPOSIO_BASE_URL=<preview-backend-url>
export COMPOSIO_WEB_URL=<preview-dashboard-url>
```

Then authenticate against that environment:

```bash
$BINARY login
```

## Step 6: Post results to the PR

This test should be run on PRs that touch CLI code. After testing, leave a PR comment summarizing the results and how to reproduce. Use `gh pr comment`:

```bash
gh pr comment <pr-number> --repo ComposioHQ/composio --body "$(cat <<'EOF'
## Binary bundle test results

| Command | Result |
|---|---|
| `composio version` | ✅ / ❌ |
| `composio whoami` | ✅ / ❌ |
| `composio run '...'` | ✅ / ❌ |
| `composio run` with `experimental_subAgent()` | ✅ / ❌ |

<details>
<summary>Reproduce locally</summary>

```sh
mkdir -p /tmp/composio-prerelease-test && cd /tmp/composio-prerelease-test \
  && curl -L -o <ARTIFACT>.zip '<RELEASE_URL>' \
  && unzip -o <ARTIFACT>.zip \
  && ./<ARTIFACT>/composio version
```

</details>
EOF
)"
```

Fill in the actual results, artifact name, and release URL. Keep the comment concise — the details block lets anyone reproduce without cluttering the PR.

## Reference Files

| File | Purpose |
|---|---|
| `.github/workflows/build-cli-binaries.yml` | CI workflow that builds binaries |
| `ts/packages/cli/package.json` | Source of CLI version |
| `ts/packages/cli/scripts/build-binary.ts` | Local binary build script |
| `ts/packages/cli/scripts/build-binary-cross.ts` | Cross-platform build script |
