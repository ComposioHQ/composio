# PR Agent Guide

This guide provides detailed steps to create a PR agent that leverages Composio, agentic frameworks such as Langchain, LlamaIndex, CrewAI, Autogen, OpenAI and ChatGPT to review PRs every time they're created. Ensure you have Python 3.8 or higher installed.

# PR Agent Schematic 
![alt text](https://github.com/composiohq/composio/blob/feat/slack-assistant/python/examples/pr_agent/schematic.png?raw=true)

## Adding a Slackbot
![alt text](https://github.com/composiohq/composio/blob/feat/slack-assistant/python/examples/pr_agent/adding_slack_bot.gif?raw=true)

## Steps to perform before running

Ensure you have triggers enabled in the Composio Dashboard. These are the triggers to enable:
1. [Github Pull Request Event (trigger_id = GITHUB_PULL_REQUEST_EVENT)](https://app.composio.dev/trigger/github_pull_request_event?page=1)

Add the slackbot to general channel in your workspace to use it.

## Steps to Run

**Navigate to the Project Directory:**
Change to the directory where the `setup.sh`, `main.py`, `requirements.txt`, and `README.md` files are located. For example:
```sh
cd path/to/project/directory
```

### 1. Run the Setup File
Make the setup.sh Script Executable (if necessary):
On Linux or macOS, you might need to make the setup.sh script executable:
```shell
chmod +x setup.sh
```
Execute the setup.sh script to set up the environment and install dependencies:
```shell
./setup.sh
```
Now, fill in the `.env` file with your secrets.

### 2. Run the Python Script
```shell
python cookbook/examples/pr_agent_crewai/main.py
```

