# README for swe

## Overview

Composio-swe is a framework for building and evaluating software engineering agents. You can use it to build your own agents or use the ones that we have built. You can run the SWE-Bench benchmark on your agent to evaluate its performance.

## Dependencies

1. Get the Github Access Token.
2. Add the environment variable `export GITHUB_ACCESS_TOKEN = <git_access_token>`.
3. Install everything locally using `pip install composio-swe` and `pip install composio-core`.
4. If you want to use crewai for your agent, install `pip install crewai` and `pip install composio-crewai`.
5. Add the LLM configuration via `OPENAI_API_KEY`. You can also use other LLMs by changing the code. More on it later.

## Getting started

You can scaffold a new agent by running `composio-swe scaffold crewai -o <path>`. This will create a new agent in `<path>/agent`.
There will be 4 files created:

1. `agent/main.py`: This is the main file to run the agent on your issue.
2. `agent/agent.py`: This is the agentic code, which you should edit to change the agentic logic
3. `agent/prompts.py`: This is the prompts for the agent.
4. `agent/benchmark.py`: This is to run the SWE-Bench benchmark on your agent.

NOTE: By default, the SWE-agent runs on docker. If you want to run it locally, you can do so by changing the workspace_env in the `agent/agent.py` file.

## Adding a new tool.

Check https://docs.composio.dev/sdk/python/local_tools to add a new local tool, which you can use inside the agent.

## Adding a new shell tool.

There are various tools which you want to run in the running shell session to maintain the context of the issue. You can check https://github.com/ComposioHQ/composio/blob/master/python/composio/tools/local/shelltool/git_cmds/actions/get_patch.py to understand how to add a new shell tool.
You need to:

1. Implement `ShellRequest`, `ShellExecResponse` and `BaseExecCommand` to do the same.
2. Use `exec_cmd` to exec your commands.
