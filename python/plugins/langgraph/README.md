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
from langchain.agents import create_openai_functions_agent, AgentExecutor
import json
import operator
from typing import Annotated, TypedDict, Sequence

from langchain_openai import ChatOpenAI
from langchain_core.utils.function_calling import convert_to_openai_function
from langchain_core.messages import BaseMessage, HumanMessage, FunctionMessage

from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolInvocation, ToolExecutor
```

#### 2. Fetch GitHub LangGraph Tools via Composio

Access GitHub tools provided by Composio for LangGraph, initialize a `tool_executor` and get OpenAI-format function schemas from the tools.

```python
from composio_langgraph import Action, ComposioToolSet

# Initialize the toolset for GitHub
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER]
)
tool_executor = ToolExecutor(tools)
functions = [convert_to_openai_function(t) for t in tools]
```

#### 3. Prepare the model

Initialize the LLM class and bind obtained functions to the model.

```python
model = ChatOpenAI(temperature=0, streaming=True)
model = model.bind_functions(functions)
```
#### 4. Define the Graph Nodes

LangGraph expects you to define different nodes of the agentic workflow as separate functions. 

Here we define one node for calling the LLM and another for executing the correct tool(function), with appropriate parameters.

```python
def function_1(state):
    messages = state['messages']
    response = model.invoke(messages)
    return {"messages": [response]}


def function_2(state):
    messages = state['messages']
    last_message = messages[-1]

    parsed_function_call = last_message.additional_kwargs["function_call"]

    action = ToolInvocation(
        tool=parsed_function_call["name"],
        tool_input=json.loads(parsed_function_call["arguments"]),
    )

    response = tool_executor.invoke(action)

    function_message = FunctionMessage(content=str(response), name=action.tool)

    return {"messages": [function_message]}

```
#### 5. Define the Graph Edges

To establish the agent's workflow, we begin by initializing the workflow with an `AgentState` to maintain state, followed by specifying the connecting edges between nodes. These edges can be straightforward or conditional, depending on the workflow requirements.

```python

def where_to_go(state):
    messages = state['messages']
    last_message = messages[-1]

    if "function_call" in last_message.additional_kwargs:
        return "continue"
    else:
        return "end"


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]


workflow = StateGraph(AgentState)
workflow.add_node("agent", function_1)
workflow.add_node("tool", function_2)
workflow.add_conditional_edges(
    "agent",
    where_to_go,
    {
        "continue": "tool",
        "end": END
    }
)
workflow.add_edge('tool', 'agent')
workflow.set_entry_point("agent")

app = workflow.compile()
```
#### 6. Invoke & Check Response

After the compilation of workflow, we invoke the LLM with a task, and print the final response. 

```python
inputs = {
    "messages": [
        HumanMessage(
            content="Star the Github repository sawradip/sawradip"
            )
        ]
    }
response = app.invoke(inputs)
print(response)
```
