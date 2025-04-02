# AI Agent with MCP Servers and OpenAI Agents SDK

This guide provides detailed steps to create an AI agent system that can perform various tasks using Composio, OpenAI Agents SDK, and MCP servers.

## Steps to Run

**Navigate to the Project Directory:**
Change to the directory where the `main.py`, `requirements.txt`, and `README.md` files are located:
```sh
cd path/to/project/directory
```

### 1. Run the Setup Script
Make the setup script executable:
```shell
chmod +x setup.sh
```

Run the setup script:
```shell
./setup.sh
```

The setup script will:
- Create a Python virtual environment
- Install required dependencies
- Create a template .env file if it doesn't exist
- Make main.py executable

### 2. Environment Setup
Fill in your API keys in the generated `.env` file:
- OpenAI API credentials
- Composio credentials

### 3. Prerequisites
Use Python version 3.10

Ensure you have `uv` installed. If not, install it from:
https://docs.astral.sh/uv/getting-started/installation/

### 4. Run the Python Script
Start the AI Agent:
```shell
python main.py
```

The script will:
2. Initialize connections to two MCP servers:
   - Slack MCP server
3. Generate a trace ID for monitoring the workflow
4. Check for active Slack connection
5. Prompt for user input on what task to perform
6. Execute the requested task using the available agents:
   - Search Assistant (for browser-based tasks)
   - Personal Assistant (for coordinating tasks)
   - Slack Assistant (for Slack interactions)

Note: When prompted "Are you connected (yes or no)?", you must confirm the Slack connection before proceeding with the task execution.




