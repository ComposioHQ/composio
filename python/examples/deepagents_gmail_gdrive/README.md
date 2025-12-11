# DeepAgents Chat Agent with Gmail and Google Drive

This example demonstrates how to create a chat agent using LangChain's DeepAgents framework integrated with Composio tools for Gmail and Google Drive operations.

## Features

The agent can perform the following tasks:

**Gmail Operations:**
- Read and search emails
- Send emails and replies
- Manage email labels
- Create drafts

**Google Drive Operations:**
- Create, read, and update files
- Search for files and folders
- Organize files into folders
- Share files with others

**DeepAgents Capabilities:**
- Automatic task planning with todo lists
- Multi-step task execution
- Context summarization for long conversations
- Sub-agent delegation for complex tasks

## Prerequisites

1. **Install Dependencies:**
   ```bash
   pip install deepagents composio composio-langchain langchain-anthropic langchain-openai
   ```

2. **Set up Composio Authentication:**
   ```bash
   # Connect your Gmail account
   composio add gmail
   
   # Connect your Google Drive account
   composio add googledrive
   ```

3. **Set Environment Variables:**
   ```bash
   export COMPOSIO_API_KEY="your-composio-api-key"
   export OPENAI_API_KEY="your-openai-api-key"
   # Or if using Anthropic:
   export ANTHROPIC_API_KEY="your-anthropic-api-key"
   ```

## Usage

### Interactive Chat Mode

Run the agent in interactive chat mode:

```bash
python main.py
```

### Single Task Mode

Execute a single task:

```bash
python main.py --task "Send an email to john@example.com with subject 'Hello' and body 'Hi John, how are you?'"
```

### Command Line Options

- `--user-id`: Composio user ID for authentication (default: "default")
- `--model`: Model to use (default: "gpt-4o")
- `--anthropic`: Use Anthropic's Claude model instead of OpenAI
- `--task`: Run a single task instead of interactive chat

### Example Tasks

Here are some example tasks you can ask the agent to perform:

```
# Gmail examples
"Show me my latest 5 unread emails"
"Send an email to alice@example.com about the meeting tomorrow"
"Search for emails from bob@example.com"
"Create a draft email to the team about the project update"

# Google Drive examples
"List all files in my Drive"
"Create a new document called 'Meeting Notes'"
"Search for files containing 'budget'"
"Share the file 'Report.pdf' with john@example.com"

# Combined tasks
"Find all emails about the quarterly report and create a summary document in Drive"
"Check my unread emails and create a todo list document in Drive"
```

## Architecture

This example combines two powerful frameworks:

1. **DeepAgents**: Provides the agent harness with built-in planning (TodoListMiddleware), context management (SummarizationMiddleware), and sub-agent delegation capabilities.

2. **Composio**: Provides authenticated access to Gmail and Google Drive APIs through its tool integration platform, handling OAuth flows and API calls.

The integration works by:
1. Fetching Gmail and Google Drive tools from Composio using the LangchainProvider
2. Passing these tools to DeepAgents' `create_deep_agent()` function
3. The agent can then use both DeepAgents' built-in tools (todos, filesystem) and Composio's external tools (Gmail, Drive)

## Customization

You can customize the agent by modifying the `create_gmail_gdrive_agent()` function:

- Add more Composio toolkits (e.g., "GOOGLECALENDAR", "SLACK")
- Modify the system prompt for different behaviors
- Add custom middleware for specific use cases
- Configure different models or parameters
