from typing import Literal

from composio_langgraph import LanggraphProvider
from langchain_openai import ChatOpenAI
from langgraph.graph import MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from composio import Composio

composio = Composio(provider=LanggraphProvider())
tools = composio.tools.get(
    user_id="default",
    tools=[
        "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
        "GITHUB_GET_THE_AUTHENTICATED_USER",
    ],
)
tool_node = ToolNode(tools)
model_with_tools = ChatOpenAI(temperature=0, streaming=True).bind_tools(tools)


def should_continue(state: MessagesState) -> Literal["tools", "__end__"]:
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:  # type: ignore
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
            (  # type: ignore
                "human",
                "Star the Github Repository composiohq/composio",
            )
        ]
    },
    stream_mode="values",
):
    chunk["messages"][-1].pretty_print()
