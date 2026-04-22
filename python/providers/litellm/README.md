# composio-litellm

Use Composio tools with [LiteLLM](https://github.com/BerriAI/litellm) to access 100+ LLM providers through a single interface.

## Installation

```bash
pip install composio-litellm
```

## Usage

```python
import litellm
from composio import Composio
from composio_litellm import LiteLLMProvider

composio = Composio()
provider = LiteLLMProvider()

# Get tools for your user
tools = composio.tools.get(user_id="user-123", toolkits=["github"])
wrapped_tools = provider.wrap_tools(tools)

# Use with any LiteLLM model
response = litellm.completion(
    model="anthropic/claude-sonnet-4-20250514",  # or any 100+ providers
    messages=[{"role": "user", "content": "Star the composio repo"}],
    tools=wrapped_tools,
    drop_params=True,
)

# Handle tool calls
results = provider.handle_tool_calls(
    user_id="user-123",
    response=response,
)
```
