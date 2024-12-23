from composio import Composio, ComposioToolSet
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from typing import Annotated
from langchain_core.messages import BaseMessage
from typing_extensions import TypedDict
from composio_langgraph import Action, ComposioToolSet, App
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
load_dotenv()

class State(TypedDict):
    messages: Annotated[list, add_messages]

graph_builder = StateGraph(State)

toolset = ComposioToolSet()
tools = toolset.get_tools(apps=[App.CODEINTERPRETER, App.FILETOOL, App.HACKERNEWS, App.SHELLTOOL, App.WEBTOOL])

llm = ChatOpenAI(model="gpt-4o")
#llm = ChatGroq(model='llama3.3-70b-versatile')
llm_with_tools = llm.bind_tools(tools)

def chatbot(state: State):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}

graph_builder.add_node("chatbot", chatbot)

tool_node = ToolNode(tools=tools)
graph_builder.add_node("tools", tool_node)

graph_builder.add_conditional_edges(
    "chatbot",
    tools_condition,
)
# Any time a tool is called, we return to the chatbot to decide the next step
graph_builder.add_edge("tools", "chatbot")
graph_builder.add_edge(START, "chatbot")
memory = MemorySaver()

graph = graph_builder.compile(checkpointer=memory)

config = {"configurable": {"thread_id": "1"}, "recursion_limit": 50}


user_input = ("""You are an Indie Hacker Agent, you are supposed to research hackernews.
Find an interesting idea to implement, and implement an MVP Version of it. The idea implementation
should then be executed and shown to the user. The idea is to build a very simple but very very cool MVP. You cannot ask any questions to the user.
Also print the link to the original idea on hackernews.""")
# The config is the **second positional argument** to stream() or invoke()!
events = graph.stream(
    {"messages": [("user", user_input)]}, config, stream_mode="values"
)
for event in events:
    event["messages"][-1].pretty_print()

user_input_2 = input("Anything else you want to ask: ")
events = graph.stream(
    {
        "messages": [
            (
                "user",
                user_input_2
            )
        ]
    },
    config,
    stream_mode="values",
)
for event in events:
    event["messages"][-1].pretty_print()