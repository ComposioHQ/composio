## 🚀🔗 Leveraging OpenAI with Composio

Facilitate the integration of OpenAI with Composio to empower OpenAI models to directly interact with external applications, broadening their capabilities and application scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via OpenAI Function Calls.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio core and the OpenAI provider
pip install composio composio-openai openai

# Connect your GitHub account
composio add github

# View available toolkits you can connect with
composio toolkits
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from OpenAI and Composio.

```python
from openai import OpenAI

from composio import Composio
from composio_openai import OpenAIProvider

# Initialize OpenAI client
openai_client = OpenAI()

# Initialize Composio with the OpenAI provider
composio = Composio(provider=OpenAIProvider())
```

> Tip: For OpenAI's Responses API, swap `OpenAIProvider` for `OpenAIResponsesProvider` (also exported from `composio_openai`).

### Step 2: Integrating GitHub Tools with Composio

Fetch GitHub tools for the user from Composio. Tools are returned in OpenAI's function-calling format, ready to pass to `chat.completions.create`.

```python
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])
```

### Step 3: Agent Execution

Send a request to OpenAI with the Composio-provided tools.

```python
task = "Star a repo composiohq/composio on GitHub"

response = openai_client.chat.completions.create(
    model="gpt-4o-mini",
    tools=tools,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": task},
    ],
)

print(response)
```

### Step 4: Validate Execution Response

Have Composio handle any tool calls the model produced and return the results.

```python
result = composio.provider.handle_tool_calls(response=response, user_id="default")
print(result)
```
