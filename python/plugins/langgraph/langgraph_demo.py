import json
import operator
from typing import Annotated, Sequence, TypedDict

from langchain_core.messages import BaseMessage, FunctionMessage, HumanMessage
from langchain_core.utils.function_calling import convert_to_openai_function
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

from composio_langgraph import Action, ComposioToolSet


composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)
functions = [convert_to_openai_function(t) for t in tools]

model = ChatOpenAI(temperature=0, streaming=True)
model = model.bind_functions(functions)


def function_1(state):
    messages = state["messages"]
    response = model.invoke(messages)
    return {"messages": [response]}


def function_2(state):
    messages = state["messages"]
    last_message = messages[-1]

    parsed_function_call = last_message.additional_kwargs["function_call"]

    # Find the correct tool to use from the provided list of tools.
    tool_to_use = None
    for t in tools:
        if t.name == parsed_function_call["name"]:
            tool_to_use = t
            break

    if tool_to_use is None:
        raise ValueError(f"Tool with name {parsed_function_call['name']} not found.")

    response = tool_to_use.invoke(json.loads(parsed_function_call["arguments"]))

    function_message = FunctionMessage(
        content=str(response), name=parsed_function_call["name"]
    )

    return {"messages": [function_message]}


def where_to_go(state):
    messages = state["messages"]
    last_message = messages[-1]

    if "function_call" in last_message.additional_kwargs:
        return "continue"
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
        # If return is "continue" then we call the tool node.
        "continue": "tool",
        # Otherwise we finish. END is a special node marking
        # that the graph should finish.
        "end": END,
    },
)
workflow.add_edge("tool", "agent")
workflow.set_entry_point("agent")

app = workflow.compile()
inputs = {
    "messages": [
        HumanMessage(content="Star a repo composiohq/composio on GitHub"),
    ]
}
for output in app.stream(inputs):
    for key, value in output.items():
        print(f"Output from node '{key}':")
        print("---")
        print(value)
    print("\n---\n")
