# Slack Bot Guide

This guide provides detailed steps to create a Slack Bot Agent that leverages Composio, agentic frameworks such as Langchain, LlamaIndex, CrewAI, Autogen and ChatGPT to review PRs every time they're created. Ensure you have Python 3.8 or higher installed.

# How to use Ollama

To install Ollama on Linux run
```sh
curl -fsSL https://ollama.com/install.sh | sh
```

To install Ollama on Windows, go to this [link](https://ollama.com/download)

After installation, run Ollama with the following command
```sh
ollama serve & ollama pull mistral
```

# Slack Bot Schematic 
![alt text](https://github.com/composiohq/composio/blob/feat/slack-assistant/python/examples/slack_bot_agent/schematic.png?raw=true)

## Adding a Slackbot
![alt text](https://github.com/ComposioHQ/composio/blob/master/python/examples/advanced_agents/slack_bot_agent/adding_slack_bot.gif?raw=true)

## Steps to perform before running

Ensure that triggers are enabled in the Composio Dashboard. These are the triggers to enable:
1. [Slack Bot Receive Message (trigger_id = SLACKBOT_RECEIVE_MESSAGE)](https://app.composio.dev/app/slackbot)
2. [Slack Bot Receive Thread Reply (trigger_id = SLACKBOT_RECEIVE_THREAD_REPLY)](https://app.composio.dev/app/slackbot)

Add the slackbot to any channel in your workspace to use it.

## Steps to Run

**Navigate to the Project Directory:**
Change to the directory where the `setup.sh`, `slack_agent_langchain.py`, `requirements.txt`, and `README.md` files are located. For example:
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
python python/examples/advanced_agents/slack_bot_agent/slack_agent_ollama/main.py
```

