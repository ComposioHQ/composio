## 🚀🔗 Leveraging Ag2 with Composio

Facilitate the integration of Ag2 with Composio to empower LLMs to directly interact with external applications & knowledge base, broadening their capabilities and application scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via Ag2 Tool Calls.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio Ag2 package
pip install composio-ag2

# Connect your GitHub account
composio add github

# View available applications you can connect with
composio apps
```

### Usage Steps

### Step 1. Import Base Packages

Prepare your environment by initializing necessary imports from Ag2.

```python
from autogen import AssistantAgent, UserProxyAgent

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

### Step 2: Integrating GitHub Tools with Composio

This step involves fetching and integrating GitHub tools provided by Composio.
```python
from composio_ag2 import ComposioToolSet, App, Action
import os

composio_tools = ComposioToolSet()

# Register tools with appropriate executors
composio_tools.register_tools(tools=[App.GITHUB], caller=chatbot, executor=user_proxy)
```

### 3. Execute the Task via Agent

Perform tasks like starring a repository on GitHub using the configured agent.

```python
task = "Star a repo composiohq/composio on GitHub"

# Initiate the task
response = user_proxy.initiate_chat(chatbot, message=task)

print(response.chat_history)
```
