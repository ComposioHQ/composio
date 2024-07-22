import json
import operator
import os
from typing import Annotated, Sequence, TypedDict

import dotenv
from langchain_core.messages import BaseMessage, FunctionMessage, HumanMessage
from langchain_core.utils.function_calling import convert_to_openai_function
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolExecutor, ToolInvocation
from composio.tools.local import embedtool
from composio_langgraph import Action, ComposioToolSet, App

dotenv.load_dotenv()


composio_toolset = ComposioToolSet()
# Retrieve tools from Composio, specifically the EMBEDTOOL app
tools = composio_toolset.get_tools(apps=[App.EMBEDTOOL])
tool_executor = ToolExecutor(tools)
functions = [convert_to_openai_function(t) for t in tools]

model = ChatOpenAI(model="gpt-4o", temperature=0, streaming=True)
model = model.bind_functions(functions)


def process_agent_response(state):
    messages = state["messages"]
    response = model.invoke(messages)
    return {"messages": messages + [response]}


def execute_tool(state):
    messages = state["messages"]
    last_message = messages[-1]

    parsed_function_call = last_message.additional_kwargs["function_call"]

    action = ToolInvocation(
        tool=parsed_function_call["name"],
        tool_input=json.loads(parsed_function_call["arguments"]),
    )

    response = tool_executor.invoke(action)

    function_message = FunctionMessage(content=str(response), name=action.tool)

    return {"messages": messages + [function_message]}


def determine_next_step(state):
    last_message = state["messages"][-1]
    return "continue" if "function_call" in last_message.additional_kwargs else "end"


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]


workflow = StateGraph(AgentState)
workflow.add_node("agent", process_agent_response)
workflow.add_node("tool", execute_tool)
workflow.add_conditional_edges(
    "agent", determine_next_step, {"continue": "tool", "end": END}
)
workflow.add_edge("tool", "agent")
workflow.set_entry_point("agent")

app = workflow.compile()


def get_valid_input(prompt, input_type=str):
    while True:
        try:
            user_input = input(prompt)
            return input_type(user_input)
        except ValueError:
            print(f"Invalid input. Please enter a valid {input_type.__name__}.")


images_path = get_valid_input("Enter the path to the images folder: ")
search_prompt = input("Enter the image description for the image you want to search: ")
top_n_images = get_valid_input("Enter the number of closest images to return: ", int)

task_description = f"""
    Check if a Vector Store exists for the image directory
    If it doesn't exist, create a vector store.
    If it already exists, query the vector store
    Search the vector store for images that look like: {search_prompt}
    The images path and indexed directory is: {images_path}
    Return the top {top_n_images} results.
"""

inputs = {"messages": [HumanMessage(content=task_description)]}

print("Processing your request...")
for output in app.stream(inputs):
    for node_name, node_output in output.items():
        print(f"\nOutput from node '{node_name}':")
        print("---")
        print(node_output["messages"][-1].content)
    print("\n---\n")

print("Task completed.")
