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
