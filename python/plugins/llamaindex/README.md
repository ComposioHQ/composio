## 🦙 Using Composio With LlamaIndex

Integrate Composio with llamaindex agents to allow them to interact seamlessly with external apps & data sources, enhancing their functionality and reach.

### Goal

- **Star a repository on GitHub** using natural language commands through a llamaindex Agent.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio llamaindex package
pip install composio-llamaindex

# Connect your GitHub account
composio-cli add github

# View available applications you can connect with
composio-cli show-apps
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from llamaindex and setting up your agent.

```python
from llama_index.llms.openai import OpenAI
from llama_index.core.llms import ChatMessage
from llama_index.core.agent import FunctionCallingAgentWorker

import dotenv
from llama_index.core.tools import FunctionTool

# Load environment variables from .env
dotenv.load_dotenv()

llm = OpenAI(model="gpt-4-turbo")
```

#### 2. Fetch GitHub llamaindex Tools via Composio

Access GitHub tools provided by Composio for llamaindex.

```python
from composio_llamaindex import App, Action, ComposioToolSet

# Get All the tools
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)
print(tools)
```

#### 3. Prepare the Agent

Configure the agent to perform tasks such as starring a repository on GitHub.

```python

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are now a integration agent, and what  ever you are requested, you will try to execute utilizing your toools."
        ),
    )
]

agent = FunctionCallingAgentWorker(
    tools=tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()
```

#### 4. Check Response

Validate the execution and response from the agent to ensure the task was completed successfully.

```bash
response = agent.chat("Hello! I would like to star a repo composiohq/composio on GitHub")
print("Response:", response)
```
