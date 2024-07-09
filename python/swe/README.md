# SWE Development Kit

## Table of Contents

- [SWE Development Kit](#swe-development-kit)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Dependencies](#dependencies)
  - [Getting Started](#getting-started)
    - [Scaffolding a New Agent](#scaffolding-a-new-agent)
    - [Docker Environment](#docker-environment)
    - [Running the Benchmark](#running-the-benchmark)
  - [Extending Functionality](#extending-functionality)
    - [Adding a New Tool](#adding-a-new-tool)
    - [Adding a New Shell Tool](#adding-a-new-shell-tool)

## Overview

Composio-swe is a powerful framework for building and evaluating software engineering agents. With this toolkit, you can:

- Build your own custom agents
- Utilize pre-built agents provided by Composio
- Run the SWE-Bench benchmark to evaluate agent performance

## Dependencies

Before getting started, ensure you have the following set up:

1. **Installation**:

   ```
   pip install composio-swe composio-core
   ```

2. **Optional CrewAI Support**:
   If you plan to use CrewAI for your agent:

   ```
   pip install crewai composio-crewai
   ```

3. **GitHub Access Token**:

   - Create one at https://github.com/settings/tokens with necessary permissions
   - Set the environment variable: `export GITHUB_ACCESS_TOKEN=<your_token>`

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

2. Run the agent:
   ```
   cd agent
   python main.py
   ```
   You'll be prompted for the repository name and issue.

### Docker Environment

The SWE-agent runs in Docker by default for security and isolation. This sandboxes the agent's operations, protecting against unintended consequences of arbitrary code execution.

To run locally instead, modify `workspace_env` in `agent/agent.py`. Use caution, as this bypasses Docker's protective layer.

### Running the Benchmark

[SWE-Bench](https://www.swebench.com/) is a comprehensive benchmark designed to evaluate the performance of software engineering agents. It comprises a diverse collection of real-world issues from popular Python open-source projects, providing a robust testing environment.

To run the benchmark:

1. Ensure Docker is installed and running on your system.
2. Execute the following command:
   ```
   cd agent
   python benchmark.py --test_split=<test_split>
   ```
   - By default, `python benchmark.py` runs only 1 test instance.
   - Specify a test split ratio to run more tests, e.g., `--test_split=1:300` runs 300 tests.

**Note**: We utilize [SWE-Bench-Docker](https://github.com/aorwall/SWE-bench-docker) to ensure each test instance runs in an isolated container with its specific environment and Python version.

## Extending Functionality

### Adding a New Tool

To add a new local tool for use within the agent, refer to the <a href="https://docs.composio.dev/sdk/python/local_tools" target="_blank">Local Tool documentation</a>.

### Adding a New Shell Tool

> **Important**: When adding a new tool, run the SWE agent with `COMPOSIO_DEV_MODE=1` to reflect changes within the Docker container.

The agent can create and manage multiple shell sessions, allowing for complex workflows and maintaining separate contexts. Key features include:

1. Dynamic shell session creation
2. Default use of the most recent active session
3. Session-specific environment persistence
4. Ability to switch between sessions
5. Useful for multi-tasking and maintaining separate contexts

For tools requiring execution in the active shell session:

1. Implement the following classes:

   - `ShellRequest`
   - `ShellExecResponse`
   - `BaseExecCommand`

2. Use the `exec_cmd` function to execute commands

For an implementation example, see the [Git Patch Tool](https://github.com/ComposioHQ/composio/blob/master/python/composio/tools/local/shelltool/git_cmds/actions/get_patch.py).
