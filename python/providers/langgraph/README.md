## 🦜🕸️ Using Composio With LangGraph

Integrate Composio with LangGraph agentic workflows and enable them to interact seamlessly with external apps, enhancing their functionality and reach.

### Goal

- **Star a repository on GitHub** using natural-language commands through a LangGraph agent.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio core and the LangGraph provider
pip install composio composio-langgraph langgraph langchain_openai

# Connect your GitHub account (also available in the dashboard)
composio link github
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from LangGraph, LangChain, and Composio.

```python
from typing import Literal

from langchain_openai import ChatOpenAI
from langgraph.graph import MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from composio import Composio
from composio_langgraph import LanggraphProvider
```

#### 2. Fetch GitHub Tools via Composio

Initialize Composio with the `LanggraphProvider` and fetch the GitHub tools you want the agent to use, then wrap them in a `ToolNode`.

```python
composio = Composio(provider=LanggraphProvider())

tools = composio.tools.get(
    user_id="default",
    tools=[
        "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
        "GITHUB_GET_THE_AUTHENTICATED_USER",
    ],
)
tool_node = ToolNode(tools)
```

#### 3. Prepare the Model

Initialize the LLM and bind the Composio-provided tools to it.

```python
model = ChatOpenAI(temperature=0, streaming=True)
model_with_tools = model.bind_tools(tools)
```

#### 4. Define the Graph Nodes

LangGraph expects each agentic step to be a function. Define the LLM-call node here.

```python
def call_model(state: MessagesState):
    messages = state["messages"]
    response = model_with_tools.invoke(messages)
    return {"messages": [response]}
```

#### 5. Wire Up the Graph

Add the `agent` and `tools` nodes, connect them with edges, and compile.

```python
def should_continue(state: MessagesState) -> Literal["tools", "__end__"]:
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "tools"
    return "__end__"


workflow = StateGraph(MessagesState)
workflow.add_node("agent", call_model)
workflow.add_node("tools", tool_node)

workflow.add_edge("__start__", "agent")
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")

app = workflow.compile()
```

#### 6. Invoke and Stream the Response

```python
for chunk in app.stream(
    {
        "messages": [
            ("human", "Star the GitHub repository composiohq/composio"),
        ]
    },
    stream_mode="values",
):
    chunk["messages"][-1].pretty_print()
```
