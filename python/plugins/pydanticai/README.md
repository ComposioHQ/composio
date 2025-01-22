## 🚀🔗 Leveraging Pydantic-AI with Composio

Integrate Pydantic-AI agents with Composio to enable direct interaction with external applications, enhancing their capabilities through strongly-typed, validated tools.

### Objective

- **Automate GitHub operations** using type-safe instructions via Pydantic-AI's Tool system.
- Demonstrate how to use Composio's tools with Pydantic-AI's strict type checking and validation.

### Installation and Setup

Install the necessary packages and connect your GitHub account to enable agent interactions with GitHub:

```bash
# Install Composio Pydantic-AI package
pip install composio-pydanticai

# Connect your GitHub account
composio add github

# View available applications you can connect with
composio apps
```

### Usage Steps

#### 1. Import Required Packages

Set up your environment by importing the necessary components from Composio & Pydantic-AI:

```python
from dotenv import load_dotenv
import os

from composio import Action
from composio_pydanticai import ComposioToolSet
from pydantic_ai import Agent
```

#### 2. Initialize Tools with Composio

Configure and fetch GitHub tools provided by Composio:

```python
# Initialize toolset
composio_toolset = ComposioToolSet()

# Configure max retries for specific tools
max_retries = {
    Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER: 5,    # More retries for starring
    Action.GITHUB_CREATE_REPOSITORY: 2   # Fewer retries for creation
}

# Get GitHub tools with retry configuration
tools = composio_toolset.get_tools(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER],
    max_retries=max_retries,
    default_max_retries=3  # Default retries for tools not specified in max_retries
)
```

The `max_retries` parameter lets you configure retry attempts per tool, with a default fallback for unspecified tools.

#### 3. Set Up the Pydantic-AI Agent

Create and configure a Pydantic-AI agent with the Composio tools:

```python
# Create an agent with the tools
agent = Agent(
    model="openai:gpt-4-turbo",  # Using a known model name
    tools=tools,
    system_prompt="""You are an AI agent that helps users interact with GitHub.
    You can perform various GitHub operations using the available tools.
    When given a task, analyze it and use the appropriate tool to complete it.""",
)
```

#### 4. Execute Tasks

Run your agent with specific tasks:

```python
# Define task
task = "Star a repo composiohq/composio on GitHub"

# Run the agent synchronously
result = agent.run_sync(task)
print("Result:", result.data)
print("Trace:\n\n", result.all_messages())
```

### Key Features

1. **Type Safety**: Leverages Pydantic-AI's strong type system for parameter validation
2. **Async Support**: Built-in support for asynchronous operations
3. **Error Handling**: Proper validation error handling with detailed feedback
4. **Tool Context**: Automatic context injection for tool execution
5. **Flexible Retry Configuration**: Configure retries per tool with fallback defaults

### Advanced Usage

The integration supports more complex scenarios:

```python
# Using multiple tools
tools = composio_toolset.get_tools(
    actions=[
        Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER,
        Action.GITHUB_CREATE_REPOSITORY
    ],
    max_retries={
        Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER: 5,
        Action.GITHUB_CREATE_REPOSITORY: 2
    }
)

# Filtering tools by tags
tools = composio_toolset.get_tools(
    tags=["github", "repository"],
    default_max_retries=3
)

# Using app-specific tools
tools = composio_toolset.get_tools(
    apps=[App.GITHUB],
    max_retries={
        Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER: 5
    }
)
```

### Best Practices

1. Always use proper type hints in your code
2. Handle validation errors appropriately
3. Use the latest version of both Pydantic-AI and Composio
4. Leverage async operations for better performance
5. Keep your API keys secure using environment variables
6. Configure retries based on the specific needs of each tool
