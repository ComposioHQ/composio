# Slack Bot Guide

This guide provides detailed steps to create a Slack Bot Agent that leverages Composio, agentic frameworks such as Langchain, LlamaIndex, CrewAI, AG2 (Formerly AutoGen) and OpenAi and ChatGPT to review PRs every time they're created. Ensure you have Python 3.8 or higher installed.

# Slack Bot Schematic 
![alt text](https://github.com/ComposioHQ/composio/blob/master/python/examples/advanced_agents/slack_bot_agent/schematic.png?raw=true)

## Adding a Slackbot
![alt text](https://github.com/ComposioHQ/composio/blob/master/python/examples/advanced_agents/slack_bot_agent/adding_slack_bot.gif?raw=true)

## Steps to Run

**Navigate to the Project Directory:**
Change to the directory where the `setup.sh`, `slack_agent_openai.py`, `requirements.txt`, and `README.md` files are located. For example:
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
python cookbook/examples/slack_agent_openai/slack_agent_openai.py
```


