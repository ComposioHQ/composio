## 🚀🔗 Leveraging Agno with Composio

Facilitate the integration of Agno with Composio to empower LLMs to directly interact with external applications & knowledge base, broadening their capabilities and application scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via Agno Tool Calls.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio LangChain package
pip install composio-agno

# Connect your GitHub account
composio add github

# View available applications you can connect with
composio apps
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from Agno.

```python
from agno.agent import Agent
```

### Step 2: Integrating GitHub Tools with Composio

This step involves fetching and integrating GitHub tools provided by Composio, enabling enhanced functionality for LangChain operations.
```python
from composio_agno import ComposioToolSet, Action

toolset = ComposioToolSet()
composio_tools = toolset.get_actions(actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER])
```

### Step 3: Agent Execution

This step involves configuring and executing the assistant to carry out actions, such as starring a GitHub repository.

```python

# Create a chat completion request to decide on the action
agent = Agent(tools=composio_tools, show_tool_calls=True)

agent.print_response("Can you star ComposioHQ/composio repo?")
```