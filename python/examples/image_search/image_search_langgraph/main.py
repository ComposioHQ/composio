import json
import operator
from typing import Annotated, Sequence, TypedDict

from langchain_core.messages import BaseMessage, FunctionMessage, HumanMessage
from langchain_core.utils.function_calling import convert_to_openai_function
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph  # type: ignore # pylint: disable=no-name-in-module
from langgraph.prebuilt import (  # pylint: disable=no-name-in-module # type: ignore
    ToolExecutor,
    ToolInvocation,
)
from composio.tools.local import embedtool  # For embedding tool
from composio_langgraph import Action, ComposioToolSet,App

composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])
# Retrieve tools from Composio, specifically the EMBEDTOOL apppip
tools = composio_toolset.get_tools(apps=[App.EMBEDTOOL])
tool_executor = ToolExecutor(tools)
functions = [convert_to_openai_function(t) for t in tools]

model = ChatOpenAI(model='gpt-4o', temperature=0, streaming=True)
model = model.bind_functions(functions)

def function_1(state):
    messages = state['messages']
    response = model.invoke(messages)
    return {"messages": [response]}

def function_2(state):
    messages = state['messages']
    last_message = messages[-1]

    parsed_function_call = last_message.additional_kwargs["function_call"]

    action = ToolInvocation(
        tool=parsed_function_call["name"],
        tool_input=json.loads(parsed_function_call["arguments"]),
    )

    response = tool_executor.invoke(action)

    function_message = FunctionMessage(content=str(response), name=action.tool)

    return {"messages": [function_message]}

def where_to_go(state):
    messages = state['messages']
    last_message = messages[-1]

    if "function_call" in last_message.additional_kwargs:
        return "continue"
    else:
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
        "continue": "tool",
        "end": END
    }
)
workflow.add_edge('tool', 'agent')
workflow.set_entry_point("agent")

app = workflow.compile()

images_path = input("Enter the path to the images folder:")
search_prompt = input("Enter the image description for the image you want to search:")
top_no_of_images = int(input("What number of images that are closest to the description that should be returned:")) #returns n closest images to the search 

task_description = f"""
    Check if a Vector Store exists for the image directory
    If it doesn't create a vector store.
    If it already exists, query the vector store
    Search the vector store for the image that looks like {search_prompt}
    The images path and indexed directory is {images_path}
    return the top {top_no_of_images} results.

"""
inputs = {
    "messages": [
        HumanMessage(
            content=task_description
            )
        ]
    }

for output in app.stream(inputs):
    # stream() yields dictionaries with output keyed by node name
    for key, value in output.items():
        print(f"Output from node '{key}':")
        print("---")
        print(value["messages"][-1])
    print("\n---\n")
#response = app.invoke(inputs)
#print(response)

