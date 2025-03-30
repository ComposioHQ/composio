# Slack Computer Control Agent Guide

This guide provides detailed steps to create a Slack Computer Control Agent that leverages Composio, OpenAI, and Playwright to automate computer interactions via Slack commands.

## Steps to Run

**Navigate to the Project Directory:**
Change to the directory where the `slack_to_computer.py`, `requirements.txt`, and `README.md` files are located. For example:
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

Fill in your API keys and tokens in the generated .env file.

### 2. Environment Setup
Create and configure your `.env` file with the necessary secrets:
- OpenAI API credentials
- Composio credentials

### 3. Install Dependencies
Install the required Python packages:
```shell
pip install -r requirements.txt
```

### 4. Run the Python Script
Start the Slack computer control agent:
```shell
python slack_to_computer.py
```

The agent will now listen for Slack messages and execute computer automation tasks based on the received commands. Messages starting with 'Browser-agent:' will be ignored to prevent feedback loops.



