# README for `run_on_single_issue.py`

## Overview
The script `run_on_single_issue.py` is designed to automate the process of debugging and fixing issues in a software repository using a combination of AI tools and services. It utilizes Azure's Chat OpenAI, CrewAI's tools, and a local configuration to manage and execute tasks.

## Prerequisites
- install packages from requirements.txt
- An Azure account with access to Azure Chat OpenAI services

## Environment Variables
Set the following environment variables before running the script:
- `AZURE_ENDPOINT`: The endpoint URL for the Azure Chat OpenAI service.
- `AZURE_KEY`: The API key for accessing Azure Chat OpenAI.
- `GITHUB_ACCESS_TOKEN`: The access token for GitHub to allow operations like cloning repositories and pushing fixes.

## Setting Up the Issue
The script expects an issue dictionary with the following keys:
- `repo`: The repository where the issue exists (e.g., `"ComposioHQ/composio"`).
- `issue_id`: A unique identifier for the issue, used for logging purposes.
- `description`: A detailed description of the issue that needs to be resolved.

Example of setting up an issue:

```python
issue = {
"repo": "ComposioHQ/composio",
"issue_id": "123-xyz",
"description": "Detailed description of the issue."
}
```


## Running the Script
1. Ensure all prerequisites are installed and environment variables are set.
2. Modify the `issue` dictionary in the script under the `if __name__ == "__main__":` block to reflect the actual issue you want to address.
3. Run the script using Python: python run_on_single_issue.py


## Output
The script will execute the task associated with the issue and generate logs and outputs in a directory named `./task_output_<timestamp>`, where `<timestamp>` is the time at which the script was run. This directory will contain a JSON file with logs of the agent's actions and responses.

## Logging
The script uses the `rich` library for enhanced logging. Logs are displayed on the console and can be used to trace the execution and any issues that arise during the run.

This README provides a basic guide to running the `run_on_single_issue.py` script. Adjustments may be necessary based on specific requirements or changes in the external APIs and tools used by the script.