## 🚀🔗 Integrating Composio with Griptape

Streamline the integration of Composio within the Griptape agentic framework to enhance the interaction capabilities of Griptape agents with external applications, significantly extending their operational range and efficiency.

### Objective

- **Facilitate the automation of starring a GitHub repository** through the use of conversational commands within the Griptape framework, leveraging Composio's Function Calls.


### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio LangChain package
pip install composio-griptape

# Connect your GitHub account
composio-cli add github

# View available applications you can connect with
composio-cli show-apps
```

### Usage Steps

#### 1. Initialize Environment and Client

Establish your development environment by importing necessary libraries and setting up the Griptape client.
```python
from griptape.structures import Agent
from griptape.utils import Chat

from composio_griptape import App, Action, Tag, ComposioToolSet
import dotenv


dotenv.load_dotenv("/Users/sawradip/Desktop/practice_code/practice_composio/composio_sdk/examples/.env")

```

### 2. Integrating GitHub Tools with Composio for Griptape Operations

This section guides you through the process of integrating GitHub tools into your Griptape projects using Composio's services.

```python
composio_toolset = ComposioToolSet()
composio_tools = composio_toolset.get_tools(tools = App.GITHUB)

agent = Agent(
    tools=composio_tools
)
```

### Step 3: Agent Execution

This step involves configuring and Chatting with the Griptape agent to carry out specific tasks, for example, starring a GitHub repository.

```python
Chat(agent).start()
```



