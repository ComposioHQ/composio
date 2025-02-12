## 🚀🔗 Leveraging Swarm with Composio

Integrate Swarm agents with Composio to enable direct interaction with external applications, enhancing their capabilities through strongly-typed, validated tools.

### Objective

- **Automate GitHub operations** using type-safe instructions via Swarm's Tool system.
- Demonstrate how to use Composio's tools with Swarm's strict type checking and validation.

### Installation and Setup

Requires Python 3.10+

Install the necessary packages and connect your GitHub account to enable agent interactions with GitHub:

```bash
# Install Composio Swarm package
pip install composio-swarm

# Connect your GitHub account
composio add github

# View available applications you can connect with
composio apps
```

### Usage Steps

#### 1. Import Required Packages

Set up your environment by importing the necessary components from Composio & Pydantic-AI:

```python
import os
from dotenv import load_dotenv
from swarm import Agent
from swarm.repl import run_demo_loop
from composio_swarm import ComposioToolSet, Action

load_dotenv()
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

#### 3. Set Up the Swarm Agent

Create and configure a Swarm agent with the Composio tools:

```python
# Create an agent with the tools
agent = Agent(
    name="GitHub Star Agent",
    instructions="You are an agent that stars a repository on GitHub.",
    functions=tools,
)
```

#### 4. Execute Tasks

Run your agent:

```python
run_demo_loop(agent, stream=True)
```

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
3. Use the latest version of both Swarm and Composio
4. Leverage async operations for better performance
5. Keep your API keys secure using environment variables
6. Configure retries based on the specific needs of each tool
