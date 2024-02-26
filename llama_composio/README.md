Composio <> Llama Indxex
Use Composio to get an array of tools with your llamaindex agent.

# Usage
Inside your llamaindex codebase:
```
from composio_llama import ComposioToolset
toolset = ComposioToolset(<token>)
agent = OpenAIAgent.from_tools(toolset.to_tool_list(), llm=llm, verbose=True)
...
```


