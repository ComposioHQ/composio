# Slackbot: Code Expert In Your Slack Channel

## Overview

Slack Expert serves as a code-savvy assistant, capable of answering questions related to a codebase. When a user asks a question, Slack Expert initially tries to answer using OpenAI chat completions. If additional code-specific context is required, it queries the codebase using Composio tools, refines the response, and sends it back to the user.

### Setup Instructions

Clone the Repository
   ```bash
   git clone https://github.com/ComposioHQ/composio.git
```
Go to slackbot_code_expert directory
   ```bash
   cd composio/python/examples/advanced_agents/slackbot_code_expert
```
Add your codebase directory inside /chat directory

Run the Setup Script (If you encounter permission issues, grant execute permissions by executing chmod +x setup.sh)
   ```bash
   ./setup.sh
```
The setup will:

- Prompt you to log in to Composio.
- Add the Slackbot tool.
- Create a .env file from .env.example.
- Prompt you to enter the directory name for your codebase located in /chat.

Configure API Keys in .env file 

Add the Composio Bot to Your Slack Channel

Start the agent
   ```bash
   python main.py
```

All set! You can now ask questions related to your codebase in slack.
