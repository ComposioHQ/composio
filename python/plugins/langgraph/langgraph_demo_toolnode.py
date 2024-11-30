from typing import Literal

from langchain_openai import ChatOpenAI
from langgraph.graph import MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from composio_langgraph import Action, ComposioToolSet


composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(
    actions=[
        Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER,
        Action.GITHUB_GET_THE_AUTHENTICATED_USER,
    ]
)
tool_node = ToolNode(tools)
model_with_tools = ChatOpenAI(temperature=0, streaming=True).bind_tools(tools)


def should_continue(state: MessagesState) -> Literal["tools", "__end__"]:
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "tools"
    return "__end__"


def call_model(state: MessagesState):
    messages = state["messages"]
    response = model_with_tools.invoke(messages)
    return {"messages": [response]}


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
