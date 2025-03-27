# AI News Aggregator and Slack Notification Agent Guide

This guide provides detailed steps to create an automated system that researches AI news and posts updates to Slack using Composio, OpenAI Agents SDK, and MCP servers.

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
Use Python version 3.11

Ensure you have `uv` installed. If not, install it from:
https://docs.astral.sh/uv/getting-started/installation/

### 4. Run the Python Script
Start the AI News Aggregator agent:
```shell
python main.py
```

The script will:
1. Initialize connections to two MCP servers:
   - Search server for news research
   - Slack server for message posting
2. Generate a trace ID for monitoring the workflow
3. Prompt for confirmation of Slack connection
4. Research latest news about Open Source and Closed Source AI
5. Post the collated news to your Slack channel #ai-news-updates

Note: When prompted "Are you connected (yes or no)?", you must confirm the Slack connection before the news aggregation and posting process begins.




