## 🚀🔗 Leveraging OpenAI with Composio

Facilitate the integration of OpenAI with Composio to empower OpenAI models to directly interact with external applications, broadening their capabilities and application scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via OpenAI Function Calls.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio LangChain package
pip install composio-openai

# Connect your GitHub account
composio-cli add github

# View available applications you can connect with
composio-cli show-apps
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from OpenAI and setting up your client.

```python
from openai import OpenAI

# Initialize OpenAI client
openai_client = OpenAI()
```

### Step 2: Integrating GitHub Tools with Composio

This step involves fetching and integrating GitHub tools provided by Composio, enabling enhanced functionality for LangChain operations.
```python
from composio_openai import App, ComposioToolSet

toolset = ComposioToolSet()
actions = toolset.get_tools(apps=[App.GITHUB])
```

### Step 3: Agent Execution

This step involves configuring and executing the agent to carry out actions, such as starring a GitHub repository.

```python
my_task = "Star a repo composiohq/composio on GitHub"

# Create a chat completion request to decide on the action
response = openai_client.chat.completions.create(model="gpt-4-turbo-preview",
    tools=actions, # Passing actions we fetched earlier.
    messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": my_task}
        ]
    )

pprint(response)
```

### Step 4: Validate Execution Response

Execute the following code to validate the response, ensuring that the intended task has been successfully completed.

```python
result = toolset.handle_tool_calls(response)
pprint(result)
```
