from composio import Composio, ComposioToolSet
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from typing import Annotated
from langchain_core.messages import BaseMessage
from langchain_community.document_loaders import YoutubeLoader
from typing_extensions import TypedDict
from composio_langgraph import Action, ComposioToolSet, App, Trigger
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
load_dotenv()

class State(TypedDict):
    messages: Annotated[list, add_messages]

graph_builder = StateGraph(State)

toolset = ComposioToolSet()
tools = toolset.get_tools(apps=[App.SLACK])

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
listener = toolset.create_trigger_listener()

@listener.callback(filters={"trigger_name": Trigger.SLACK_RECEIVE_MESSAGE})
def handle_callback_function(event):
    try:
        print(event)
        payload= event.payload
        print(payload)
        link = payload['text'][1:-2]
        channel_id = payload['channel']
        documents = YoutubeLoader.from_youtube_url(link, add_video_info=False).load()
        transcript=''
        for i in documents:
            transcript+=i.page_content
        print('channel id')
        user_input = f"""Summarize this transcript:{str(transcript)} and send the summary on the slack channel:{channel_id}"""
        # The config is the **second positional argument** to stream() or invoke()!
        events = graph.invoke(
            {"messages": [("user", user_input)]}, config, stream_mode="values"
        )
        print(events)
    except Exception as e:
        print('Youtube link not found in message')

print("Listening")
listener.wait_forever()