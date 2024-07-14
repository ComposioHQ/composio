# SWE Development Kit

## Table of Contents

- [SWE Development Kit](#swe-development-kit)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Dependencies](#dependencies)
  - [Getting Started](#getting-started)
    - [Creating a new agent](#creating-a-new-agent)
    - [Docker Environment](#docker-environment)
    - [Running the Benchmark](#running-the-benchmark)

## Overview

`swekit` is a framework for building SWE agents on by utilising composio tooling ecosystem. SWE Kit allows you to

- Scaffold agents which works out-of-the-box with choice of your agentic framework, `crewai`, `llamaindex`, etc...
- Tools to add or optimise your agent's abilities
- Benchmark your agents against `SWE-bench`

## Dependencies

Before getting started, ensure you have the following set up:

1. **Installation**:

   ```
   pip install swekit composio-core
   ```

2. **Install agentic framework of your choice and the Composio plugin for the same**:
   Here we're using `crewai` for the example:

   ```
   pip install crewai composio-crewai
   ```

3. **GitHub Access Token**:

   The agent requires a github access token to work with your repositories, You can create one at https://github.com/settings/tokens with necessary permissions and export it as an environment variable using `export GITHUB_ACCESS_TOKEN=<your_token>`

4. **LLM Configuration**:
   You also need to setup API key for the LLM provider you're planning to use. By default the agents scaffolded by `swekit` uses `openai` client, so export `OPENAI_API_KEY` before running your agent

## Getting Started

### Creating a new agent

1. Scaffold your agent using:

   ```
   swekit scaffold crewai -o <path>
   ```

   This creates a new agent in `<path>/agent` with four key files:

   - `main.py`: Entry point to run the agent on your issue
   - `agent.py`: Agent definition (edit this to customise behaviour)
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
   python benchmark.py --test-split=<test_split>
   ```
   - By default, `python benchmark.py` runs only 1 test instance.
   - Specify a test split ratio to run more tests, e.g., `--test-split=1:300` runs 300 tests.

**Note**: We utilize [SWE-Bench-Docker](https://github.com/aorwall/SWE-bench-docker) to ensure each test instance runs in an isolated container with its specific environment and Python version.

To extend the functionality of the SWE agent by adding new tools or extending existing ones, refer to the [Development Guide](DEVELOPMENT.md).
