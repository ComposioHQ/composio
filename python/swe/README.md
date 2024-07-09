# SWE Development Kit

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

#### Docker Environment

The SWE-agent runs in Docker by default for security and isolation. This sandboxes the agent's operations, protecting against unintended consequences of arbitrary code execution.

To run locally instead, modify `workspace_env` in `agent/agent.py`. Use caution, as this bypasses Docker's protective layer.

### Running the benchmark

[SWE-Bench](https://www.swebench.com/) is a comprehensive benchmark designed to evaluate the performance of software engineering agents. It comprises a diverse collection of real-world issues from popular Python open-source projects, providing a robust testing environment.

To run the benchmark, we utilize [SWE-Bench-Docker](https://github.com/aorwall/SWE-bench-docker).

**Important: Docker is required to run the benchmark.** Make sure you have Docker installed and running on your system before proceeding. This approach ensures that each test instance runs in an isolated container with its specific environment and Python version, maintaining consistency and preventing conflicts.

To execute the benchmark, use the following command:

```
   cd agent
   python benchmark.py --test_split=<test_split>
```

By default, if you run `python benchmark.py`, the benchmark runs only 1 test instance.
If you want to run more tests, you can specify the test split ratio.
For example, `python benchmark.py --test_split=1:300` will run 300 tests.

## Extending Functionality

### Adding a New Tool

To add a new local tool for use within the agent, refer to the [Local Tool documentation](https://docs.composio.dev/sdk/python/local_tools).

### Adding a New Shell Tool

The agent has the capability to create and manage multiple shell sessions, allowing it to run commands while maintaining environment continuity. This feature is particularly useful for executing sequences of related commands or maintaining separate contexts for different tasks.

Here's how it works:

1. Shell Session Creation: The agent can dynamically create new shell sessions as required. By default, a fresh shell session is automatically initialized when the agent begins execution, providing a clean environment for subsequent operations.

2. Default Behavior: By default, when the agent runs a shell command, it uses the most recently active shell session. This is typically the session where the agent executed its last command.

3. Session Persistence: Each shell session maintains its own environment, including variables, current working directory, and other shell-specific states. This allows for continuity between commands within the same session.

4. Switching Between Sessions: If the agent needs to run a command in a different shell session, it can do so by specifying a particular shell ID as a parameter when executing the command.

5. Use Cases: This functionality is particularly useful for scenarios where the agent needs to:
   - Work on multiple tasks simultaneously without environment conflicts
   - Maintain separate contexts for different parts of a project
   - Execute long-running processes in one session while performing other tasks in another

By leveraging these shell session capabilities, the agent can efficiently manage complex workflows that require maintaining multiple separate environments or contexts.

For tools that require execution in the active shell session to maintain issue context:

1. Implement the following classes:

   - `ShellRequest`
   - `ShellExecResponse`
   - `BaseExecCommand`

2. Utilize the `exec_cmd` function to execute your commands

For a practical implementation example, refer to the [Git Patch Tool](https://github.com/ComposioHQ/composio/blob/master/python/composio/tools/local/shelltool/git_cmds/actions/get_patch.py).

> **Important**: When introducing a new tool, ensure you run the SWE agent with the environment variable `COMPOSIO_DEV_MODE=1` to properly reflect changes within the Docker container.
