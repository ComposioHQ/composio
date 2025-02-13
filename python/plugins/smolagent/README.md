## 🚀🔗 Leveraging Smol Agents with Composio

Integrate Smol Agents with Composio to enable direct interaction with external applications, enhancing their capabilities through strongly-typed, validated tools.

### Objective

- **Automate GitHub operations** using type-safe instructions via Smol Agent's Tool system.
- Demonstrate how to use Composio's tools with Smol Agent's CodeAgent.

### Installation and Setup

Install the necessary packages and connect your GitHub account to enable agent interactions with GitHub:

```bash
# Install Composio Smol Agents package
pip install composio-smol

# Connect your GitHub account
composio add github

# View available applications you can connect with
composio apps
```

### Usage Steps

#### 1. Import Required Packages

Set up your environment by importing the necessary components from Composio & Smol Agents:

```python
from dotenv import load_dotenv
import os

from composio import Action
from composio_smol import ComposioToolSet
from smolagents import HfApiModel, CodeAgent
```

#### 2. Initialize Tools with Composio

Configure and fetch GitHub tools provided by Composio:

```python
# Initialize toolset
composio_toolset = ComposioToolSet()

# Get GitHub tools with retry configuration
tools = composio_toolset.get_tools(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER],
)
```

#### 3. Set Up the Smol Agent

Create and configure a Smol agent with the Composio tools:

```python
# Create an agent with the tools
agent = CodeAgent(
    tools=tools,
    model=HfApiModel()
)
```

#### 4. Execute Tasks

Run your agent with specific tasks:

```python
# Define task
agent.run("Star the composiohq/composio repo")
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
)

# Using app-specific tools
tools = composio_toolset.get_tools(
    apps=[App.GITHUB],
)
```

### Best Practices

1. Always use proper type hints in your code
2. Handle validation errors appropriately
3. Use the latest version of both Smol Agent and Composio
4. Leverage async operations for better performance
5. Keep your API keys secure using environment variables
6. Configure retries based on the specific needs of each tool
