# SWE Development Kit

## Table of Contents

- [SWE Development Kit](#swe-development-kit)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Dependencies](#dependencies)
  - [Getting Started](#getting-started)
    - [Creating a new agent](#creating-a-new-agent)
    - [Workspace Environment](#workspace-environment)
    - [Customising the workspace environment](#customising-the-workspace-environment)
    - [Running the Benchmark](#running-the-benchmark)

## Overview

`swekit` is a framework for building SWE agents by utilizing the composio tooling ecosystem. SWE Kit allows you to:

- Scaffold agents that work out-of-the-box with your choice of agentic framework, such as `crewai`, `llamaindex`, etc.
- Add or optimize your agent's abilities with various tools.
- Benchmark your agents against `SWE-bench`.

## Dependencies

Before getting started, ensure you have the following set up:

1. **Installation**:

   ```
   npm install swekit composio-core
   ```

2. **Install the agentic framework of your choice and the Composio plugin for it**:
   Here we're using `crewai` for the example:

   ```
   npm install crewai composio-crewai
   ```

3. **GitHub Access Token**:

   The agent requires a GitHub access token to work with your repositories. You can create one at https://github.com/settings/tokens with the necessary permissions and export it as an environment variable using `export GITHUB_ACCESS_TOKEN=<your_token>`.

4. **LLM Configuration**:
   You also need to set up an API key for the LLM provider you're planning to use. By default, the agents scaffolded by `swekit` use the `openai` client, so export `OPENAI_API_KEY` before running your agent.

## Getting Started

### Creating a new agent

1. Scaffold your agent using:

   ```
   swekit scaffold crewai -o <path> -l js swe-js
   ```

   This creates a new agent in `<path>/swe/` with four key files:

   - `src/app.ts`: Entry point to run the agent on your issue.
   - `src/prompts.ts`: Agent prompts.
   - `src/agents/swe.ts`: Agent definition (edit this to customize behavior).

2. Run the agent:
   ```
   pnpm start
   ```
   You'll be prompted for the repository name and issue.

### Workspace Environment

The SWE-agent runs in Docker by default for security and isolation. This sandboxes the agent's operations, protecting against unintended consequences of arbitrary code execution.

The composio toolset supports different types of workspaces.

1. Host - This will run on the host machine.