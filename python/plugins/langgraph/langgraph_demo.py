import json
import operator
from typing import Annotated, Sequence, TypedDict

from composio_langgraph import Action, ComposioToolSet
from langchain_core.messages import BaseMessage, FunctionMessage, HumanMessage
from langchain_core.utils.function_calling import convert_to_openai_function
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph  # pylint: disable=no-name-in-module
from langgraph.prebuilt import (  # pylint: disable=no-name-in-module
    ToolExecutor,
    ToolInvocation,
)


composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER]
)
tool_executor = ToolExecutor(tools)
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

    # We construct an ToolInvocation from the function_call and pass in the
    # tool name and the expected str input for OpenWeatherMap tool
    action = ToolInvocation(
        tool=parsed_function_call["name"],
        tool_input=json.loads(parsed_function_call["arguments"]),
    )

    # We call the tool_executor and get back a response
    response = tool_executor.invoke(action)

    # We use the response to create a FunctionMessage
    function_message = FunctionMessage(content=str(response), name=action.tool)

    # We return a list, because this will get added to the existing list
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
    where_to_go,  # Based on the return from where_to_go
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
    "messages": [HumanMessage(content="Star the Github Repository sawradip/sawradip")]
}
# response = app.invoke(inputs)
# print(response)

for output in app.stream(inputs):
    for key, value in output.items():
        print(f"Output from node '{key}':")
        print("---")
        print(value)
    print("\n---\n")
