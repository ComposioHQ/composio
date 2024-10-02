from typing import Literal
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from composio_langgraph import Action, ComposioToolSet, App
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    ToolMessage,
)
from pathlib import Path


load_dotenv()

# Initialize the toolset for Google Sheets and Code Interpreter
composio_toolset = ComposioToolSet(output_dir=Path("/Users/composio/Desktop/composio/python/examples/quickstarters/presentation_agent/langgraph/"))
tools = composio_toolset.get_tools(
    apps=[
        App.GOOGLESHEETS,
        App.CODEINTERPRETER
    ]
)
tool_node = ToolNode(tools)
GOOGLE_SHEET_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'

model = ChatOpenAI(temperature=0.2, streaming=True)
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

# Set up the edges for workflow transitions
workflow.add_edge("__start__", "agent")
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")

app = workflow.compile()

# Stream messages to the application for processing
for chunk in app.stream(
    {
        "messages": [
            (
                "human",
                f"""
                Create a ppt using python-pptx on the google sheets: {GOOGLE_SHEET_ID}.

                The python-pptx installation is successfull but its not finding it, fix that error.
                Use the python-pptx module, if it is not available install it in the sandbox.
                Plot charts and use those charts in the presentation you generate.
                Make sure the Arrays are all of the same length. 

                NOTE: Mostly the user passes small sheets, so try to read the whole sheet at once and not via ranges.
            """
            )
            ]
        },
        stream_mode="values",
    ):
    # Pretty print the last message from chunk
    chunk["messages"][-1].pretty_print()