## 🚀🔗 Leveraging CamelAI with Composio

Facilitate the integration of Camel Agents with Composio to empower the agents to directly interact with external applications, broadening their capabilities and application scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via Camel's Tool Usage ability.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio LangChain package
pip install composio-camel

# Connect your GitHub account
composio-cli add github

# View available applications you can connect with
composio-cli show-apps
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from Composio & Camel.

```python
from colorama import Fore

from camel.agents import ChatAgent
from camel.configs import ChatGPTConfig
from camel.messages import BaseMessage
from camel.models import ModelFactory
from camel.types import ModelPlatformType, ModelType
from camel.utils import print_text_animated
from composio_camel import ComposioToolSet, Action
```

### Step 2: Integrating GitHub Tools with Composio

This step involves fetching and integrating GitHub tools provided by Composio, enabling enhanced functionality for Camel operations.
```python
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)
```

### Step 3: Camel Agent Setup

This step involves configuring and executing the agent to carry out actions, such as starring a GitHub repository.

```python
# set up LLM model
assistant_model_config = ChatGPTConfig(
    temperature=0.0,
    tools=tools,
)

model = ModelFactory.create(
    model_platform=ModelPlatformType.OPENAI,
    model_type=ModelType.GPT_3_5_TURBO,
    model_config_dict=assistant_model_config.__dict__,
)


# set up agent
assistant_sys_msg = BaseMessage.make_assistant_message(
    role_name="Developer",
    content=(
        "You are a programmer as well an experienced github user. "
        "When asked given a instruction, "
        "you try to use available tools, and execute it"
    ),
)

agent = ChatAgent(
    assistant_sys_msg,
    model,
    tools=tools,
)
agent.reset()
```

### Step 4: Execute with your prompt/task.

Execute the following code to execute the agent, ensuring that the intended task has been successfully completed.

```python
prompt = (
    "I have created a new Github Repo,"
    "Please star my github repository: camel-ai/camel"
)
user_msg = BaseMessage.make_user_message(role_name="User", content=prompt)
print(Fore.YELLOW + f"user prompt:\n{prompt}\n")

response = agent.step(user_msg)
for msg in response.msgs:
    print_text_animated(Fore.GREEN + f"Agent response:\n{msg.content}\n")

```
