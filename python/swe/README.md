# SWE Development Kit

## Overview

Composio-swe is a powerful framework for building and evaluating software engineering agents. With this toolkit, you can:

- Build your own custom agents
- Utilize pre-built agents provided by Composio
- Run the SWE-Bench benchmark to evaluate agent performance

## Dependencies

Before getting started, ensure you have the following set up:

1. **GitHub Access Token**:

   - Create one at https://github.com/settings/tokens with necessary permissions
   - Set the environment variable: `export GITHUB_ACCESS_TOKEN=<your_token>`

2. **Installation**:

   ```
   pip install composio-swe composio-core
   ```

3. **Optional CrewAI Support**:
   If you plan to use CrewAI for your agent:

   ```
   pip install crewai composio-crewai
   ```

4. **LLM Configuration**:
   - Set up OpenAI API key: `export OPENAI_API_KEY=<your_key>`
   - Other LLMs can be configured by modifying the code (details provided later)

## Getting Started

### Scaffolding a New Agent

1. Run the following command:

   ```
   composio-swe scaffold crewai -o <path>
   ```

   This creates a new agent in `<path>/agent` with four key files:

   - `main.py`: Entry point to run the agent on your issue
   - `agent.py`: Core agentic logic (edit this to customize behavior)
   - `prompts.py`: Agent prompts
   - `benchmark.py`: SWE-Bench benchmark runner

   > **Note**: By default, the SWE-agent runs in Docker. To run locally, modify the `workspace_env` in `agent/agent.py`.

2. Run the agent:

   ```
   python agent/main.py
   ```

   You'll be prompted for the repository name and issue.

3. Run the benchmark:
   ```
   python agent/benchmark.py
   ```

## Extending Functionality

### Adding a New Tool

To add a new local tool for use within the agent, refer to the [Composio SDK documentation](https://docs.composio.dev/sdk/python/local_tools).

### Adding a New Shell Tool

For tools that need to run in the active shell session to maintain issue context:

1. Implement `ShellRequest`, `ShellExecResponse`, and `BaseExecCommand`
2. Use `exec_cmd` to execute your commands

Example: [Git Patch Tool](https://github.com/ComposioHQ/composio/blob/master/python/composio/tools/local/shelltool/git_cmds/actions/get_patch.py)

> **Note**: When adding a new tool, run the SWE agent with `export COMPOSIO_SWE_ENV=dev` to reflect changes in Docker.
