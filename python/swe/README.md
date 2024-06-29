# README for swe.py

## Overview

The `swe.py` script is part of the Composio software engineering (SWE) agent framework.
It is designed to automate tasks related to software development, including issue resolution, code reviews, and patch submissions using AI-driven agents.

## Dependencies

1. Docker Desktop should be installed.
2. Get the Github Access Token.
3. Install the dependencies using `pip install -r requirements.txt`.
4. Add the LLM configuration via `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` or (`AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_ENDPOINT`) environment variables.
5. Add the environment variable `export GITHUB_ACCESS_TOKEN = <git_access_token>`.
6. If you want to use Helicone, add the environment variable `export HELICONE_API_KEY = <helicone_api_key>`.

## Usage

To change the script quickly:

1. Change the issue_config in swe_run.py
2. Run the script with `python swe_run.py`

To modify the agent and improve the agent's performance:

1. Modify the agent's code in swe.py
2. Run the script with `python swe_run.py`

## Implementing your own SWE-Agent

1. Create a new class that inherits from `BaseSWEAgent`.
2. Implement the `__init__` method to initialize any dependencies that your agent requires and set the tools that your agent requires.
3. Implement the `solve_issue` method to define the logic for solving the issue. This involves the agentic logic to solve the issue.
4. For example, refer `crewai_agent.py` and `llama_agent.py` for implementing the agents.
5. For implementing the tools, refer `composio/local_tools/local_workspace/workspace/tool.py` for implementing the tools.

## Running the benchmark

1. Find the benchmark at `python/swe/benchmark`.
2. To run the benchmark, run `python run_evaluation.py`.
3. This will run the SWE-Bench (https://www.swebench.com/) benchmark for the agent. You need to init your agent inside the run_evaluation.py file.
