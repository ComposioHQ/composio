## 🦜🕸️ Using Composio With LangGraph

Integrate Composio with LangGraph Agentic workflows & enable them to interact seamlessly with external apps, enhancing their functionality and reach.

### Goal

- **Star a repository on GitHub** using natural language commands through a LangGraph Agent.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio LangGraph package
pip install composio-langgraph

# Connect your GitHub account
composio-cli add github

# View available applications you can connect with
composio-cli show-apps
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from LangGraph & LangChain for setting up your agent.

```python
from typing import Literal

from langchain_openai import ChatOpenAI
from langgraph.graph import MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
```

#### 2. Fetch GitHub LangGraph Tools via Composio

Access GitHub tools provided by Composio for LangGraph, initialize a `ToolNode` with necessary tools obtaned from `ComposioToolSet`.

```python
from composio_langgraph import Action, ComposioToolSet

# Initialize the toolset for GitHub
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[
        Action.GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER,
        Action.GITHUB_USERS_GET_AUTHENTICATED,
    ])
tool_node = ToolNode(tools)
```

#### 3. Prepare the model

Initialize the LLM class and bind obtained tools to the model.

```python
model = ChatOpenAI(temperature=0, streaming=True)
model_with_tools = model.bind_tools(functions)
```
#### 4. Define the Graph Nodes

LangGraph expects you to define different nodes of the agentic workflow as separate functions. Here we define a node for calling the LLM model.

```python
def call_model(state: MessagesState):
    messages = state["messages"]
    response = model_with_tools.invoke(messages)
    return {"messages": [response]}
```
#### 5. Define the Graph Nodes and Edges

To establish the agent's workflow, we begin by initializing the workflow with `agent` and `tools` node, followed by specifying the connecting edges between nodes, finally compiling the workflow. These edges can be straightforward or conditional, depending on the workflow requirements.

```python
def should_continue(state: MessagesState) -> Literal["tools", "__end__"]:
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "tools"
    return "__end__"


workflow = StateGraph(MessagesState)

# Define the two nodes we will cycle between
workflow.add_node("agent", call_model)
workflow.add_node("tools", tool_node)

workflow.add_edge("__start__", "agent")
workflow.add_conditional_edges(
    "agent",
    should_continue,
)
workflow.add_edge("tools", "agent")

app = workflow.compile()
```
#### 6. Invoke & Check Response

After the compilation of workflow, we invoke the LLM with a task, and stream the response.

```python
for chunk in app.stream(
    {
        "messages": [
            (
                "human",
                # "Star the Github Repository composiohq/composio",
                "Get my information.",
            )
        ]
    },
    stream_mode="values",
):
    chunk["messages"][-1].pretty_print()
```
