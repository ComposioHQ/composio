## 🚀🔗 Leveraging Claude with Composio

Facilitate the integration of Anthropic's Claude with Composio to empower Claude models to directly interact with external applications, broadening their capabilities and application scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via Claude tool use.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio core and the Anthropic provider
pip install composio composio-anthropic anthropic

# Connect your GitHub account (also available in the dashboard)
composio link github
```

> Looking for the Claude Agent SDK? See `composio-claude-agent-sdk` instead.

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from Anthropic and Composio.

```python
import anthropic

from composio import Composio
from composio_anthropic import AnthropicProvider

# Initialize Claude client
client = anthropic.Anthropic()

# Initialize Composio with the Anthropic provider
composio = Composio(provider=AnthropicProvider())
```

### Step 2: Integrating GitHub Tools with Composio

Fetch GitHub tools for the user from Composio. Tools are returned in the Claude tool-use format, ready to pass to `messages.create`.

```python
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])
```

### Step 3: Agent Execution

Send a request to Claude with the Composio-provided tools.

```python
task = "Star me composiohq/composio repo in github."

response = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": task}],
)

print(response)
```

### Step 4: Validate Execution Response

Have Composio handle any tool calls the model produced and return the results.

```python
result = composio.provider.handle_tool_calls(user_id="default", response=response)
print(result)
```
