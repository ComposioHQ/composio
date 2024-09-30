# Composio <> Autogen
Use Composio to enhance your Autogen workflows with a suite of tools.

## Quick Start

### Goal

Automatically star a GitHub repository using natural language commands through an Autogen Agent.

### Installation and Setup

Install Composio Autogen and connect your GitHub account to enable your agents with GitHub functionalities.

```bash
pip install composio-autogen
composio-cli add github  # Connect your GitHub account
composio-cli show-apps   # Check all supported apps
```

### Usage

#### 1. Import Base Packages & Create Default Autogen Agent

Setup your environment by importing necessary packages and configuring the Autogen agent.

```python
from autogen import AssistantAgent, UserProxyAgent
from composio_autogen import ComposioToolSet, App, Action
import os

# Configuration for the language model
llm_config = {"config_list": [{"model": "gpt-4-turbo", "api_key": os.environ["OPENAI_API_KEY"]}]}

# Initialize the AssistantAgent
chatbot = AssistantAgent(
    "chatbot",
    system_message="Reply TERMINATE when the task is done or when user's content is empty",
    llm_config=llm_config,
)

# Initialize the UserProxyAgent
user_proxy = UserProxyAgent(
    "user_proxy",
    is_termination_msg=lambda x: x.get("content", "") and "TERMINATE" in x.get("content", ""),
    human_input_mode="NEVER",  # Don't take input from User
    code_execution_config={"use_docker": False}
)
```

#### 2. Fetch All GitHub Autogen Tools via Composio

Initialize and register the necessary tools for interacting with GitHub.

```python
from composio_autogen import ComposioToolSet, App, Action

# Initialize Composio Toolset
composio_tools = ComposioToolSet()

# Register tools with appropriate executors
composio_tools.register_tools(tools=[App.GITHUB], caller=chatbot, executor=user_proxy)
```

#### 3. Execute the Task via Agent

Perform tasks like starring a repository on GitHub using the configured agent.

```python
task = "Star a repo composiohq/composio on GitHub"

# Initiate the task
response = user_proxy.initiate_chat(chatbot, message=task)

print(response.chat_history)
```

#### 4. Check Response

Verify the task completion and response from the agent.

```bash
[{'content': 'I have starred the repository "composio" for you on GitHub under the account "composiohq".', 'role': 'user'}, 
{'content': '', 'role': 'assistant'}, {'content': 'TERMINATE', 'role': 'user'}]
```

### Advanced Configuration

- **Filter Specific Actions:** Limit the actions an agent can execute to enhance security and focus.

```python
composio_tools.register_tools(actions=[Action.GITHUB_CREATE_ISSUE])
```

- **Filter Specific Apps:** Restrict the agent's access to specific tools for streamlined operations.

```python
composio_tools.register_tools([App.ASANA, App.GITHUB])
```
