# README for swe.py

## Overview
The `swe.py` script is part of the Composio software engineering (SWE) agent framework. 
It is designed to automate tasks related to software development, including issue resolution, code reviews, and patch submissions using AI-driven agents.

## Dependencies
1. Docker should be installed
2. Get the Github Access Token.

## Usage
To change the script quickly:
1. export GITHUB_ACCESS_TOKEN = <git_access_token>
2. Change the issue_config in swe_run.py
3. Run the script with `python swe_run.py`

To modify the agent and improve the agent's performance:
1. Modify the agent's code in swe.py
2. Run the script with `python swe_run.py`