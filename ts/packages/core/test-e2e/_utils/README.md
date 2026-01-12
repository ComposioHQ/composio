# E2E Test Utilities

Shared infrastructure for running `@composio/core` end-to-end tests in isolated environments.

## What's Here

| File                 | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `run-docker-test.sh` | Generic Docker-based test runner                     |
| `Dockerfile.node`    | Multi-stage Dockerfile for Node.js test environments |

## Usage

```bash
./run-docker-test.sh \
  --name "my-test" \
  --dir "ts/packages/core/test-e2e/my-suite" \
  --cmd "node test.js" \
  --node "20.19.0"
```

### Arguments

| Argument | Short | Required | Default     | Description                             |
| -------- | ----- | -------- | ----------- | --------------------------------------- |
| `--name` | `-n`  | Yes      | —           | Docker image name                       |
| `--dir`  | `-d`  | Yes      | —           | Test directory (relative to repo root)  |
| `--cmd`  | `-c`  | No       | `pnpm test` | Command to execute inside the container |
| `--node` | —     | No       | `20.19.0`   | Node.js version                         |

## Behavior

Builds an isolated Docker container and runs the test command inside it. Docker is required.
