from composio import Composio, ComposioToolSet, action
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
from PyPDF2 import PdfReader
load_dotenv()



@action(toolname='extractor', requires=['PyPDF2'])
def extract_text_pypdf(pdf_path: str)-> str:
    """Extract text from pdf file
    
    :param pdf_path: path to the pdf file
    :return text: text extracted from the pdf file
    """
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text()
    return text

class State(TypedDict):
    messages: Annotated[list, add_messages]

graph_builder = StateGraph(State)

toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[
    Action.EXA_SEARCH, 
    extract_text_pypdf,
    Action.GOOGLEDOCS_GET_DOCUMENT_BY_ID
])

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

resume_path = input('Enter local path or Google Doc link:')
user_input = (f"""You are a resume matching Agent, your job is to read the individual's resume,
              Understand and analyse it and find the perfect job listings for them, their resume
              should be a perfect fit for the roles. The resume is at the path: {resume_path}, if it's a google doc link, use the action available to you to fetch the text inside it.
              The roles should be very specific and matched to the user's resume. The outputs shouldn't
              be vague. Also rate the resume and suggest improvements.""")
# The config is the **second positional argument** to stream() or invoke()!
events = graph.stream(
    {"messages": [("user", user_input)]}, config, stream_mode="values" # type: ignore
)
for event in events:
    event["messages"][-1].pretty_print()
