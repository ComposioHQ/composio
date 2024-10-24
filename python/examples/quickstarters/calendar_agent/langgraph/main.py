from typing import Literal

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from composio_langgraph import Action, ComposioToolSet

load_dotenv()
# Initialize the toolset for GitHub
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(
    actions=[
        Action.GOOGLECALENDAR_CREATE_EVENT,
    ])
tool_node = ToolNode(tools)

model = ChatOpenAI(temperature=0, streaming=True)
model_with_tools = model.bind_tools(tools)

def call_model(state: MessagesState):
    messages = state["messages"]
    response = model_with_tools.invoke(messages)
    return {"messages": [response]}

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


for chunk in app.stream(
    {
        "messages": [
            (
                "system",
                        """
                        You are an AI agent responsible for taking actions on Google Calendar on users' behalf. 
                        You need to take action on Calendar using Google Calendar APIs. Use correct tools to run APIs from the given tool-set.
                        """
            ),
            (
                "human",
                """
                    1PM - 3PM -> Code,
                    5PM - 7PM -> Meeting,
                    9AM - 12AM -> Learn something,
                    8PM - 10PM -> Game
                """

            )
        ]
    },
    stream_mode="values",
):
    chunk["messages"][-1].pretty_print()
