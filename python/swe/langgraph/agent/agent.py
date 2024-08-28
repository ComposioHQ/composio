"""CrewAI SWE Agent"""

import os

import dotenv

#from custom_tools import say
from langchain_openai import ChatOpenAI

from typing import Literal, Annotated, Sequence, TypedDict
import operator
from dotenv import load_dotenv
from langchain.globals import set_llm_cache
from langchain_community.cache import SQLiteCache
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langchain_community.chat_models import BedrockChat
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from composio_langgraph import Action, App, ComposioToolSet, WorkspaceType
from prompts import autonomous_engineer_system_prompt
from langchain_core.runnables.graph import CurveStyle, MermaidDrawMethod, NodeStyles
from langchain.agents import AgentExecutor, create_openai_functions_agent


# Load environment variables from .env
dotenv.load_dotenv()



# Initialize tool.
openai_client = ChatOpenAI(
    api_key=os.environ["OPENAI_API_KEY"],  # type: ignore
    model="gpt-4-turbo",
)

bedrock_client = BedrockChat(
            credentials_profile_name="default",
            model_id="anthropic.claude-3-5-sonnet-20240620-v1:0",
            streaming=True,
            region_name="us-east-1",
        )

composio_toolset = ComposioToolSet(workspace_config=WorkspaceType.Host())

# Get required tools
tools = [
    *composio_toolset.get_tools(
        apps=[
            # App.FILETOOL,
            # App.SHELLTOOL,
        ]
    ),
    *composio_toolset.get_actions(
        actions=[
            # Action.CODE_ANALYSIS,
            Action.CODE_ANALYSIS_TOOL_GET_CLASS_INFO,
            Action.CODE_ANALYSIS_TOOL_GET_METHOD_BODY,
            Action.CODE_ANALYSIS_TOOL_GET_METHOD_SIGNATURE,
            Action.FILETOOL_GIT_REPO_TREE,
            Action.FILETOOL_LIST_FILES,
            Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
            Action.FILETOOL_EDIT_FILE,
            Action.FILETOOL_GIT_PATCH,
            Action.FILETOOL_OPEN_FILE,
            Action.FILETOOL_SCROLL,
        ]
    ),
]

tool_node = ToolNode(tools)

# Define AgentState
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    sender: str
    scratchpad: str

# Agent names
coding_agent_name = "Coder"
tool_node_name = "call_tool"


# Helper function for agent nodes
def create_agent_node(agent, name):
    def agent_node(state):
        result = agent.invoke(state)
        if not isinstance(result, ToolMessage):
            result = AIMessage(**result.dict(exclude={"type", "name"}), name=name)

        # Update scratchpad
        scratchpad = state.get("scratchpad", "")
        if "Scratchpad:" in result.content:
            _, new_scratchpad = result.content.split("Scratchpad:", 1)
            scratchpad += new_scratchpad.strip() + "\n"
        
        return {"messages": [result], "sender": name, "scratchpad": scratchpad}

    return agent_node


# Create agents
def create_agent(system_prompt, tools):
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="messages"),
            ("human", "Scratchpad (for your thoughts):\n{scratchpad}"),
        ]
    )
    llm = openai_client
    return prompt | llm.bind_tools(tools)


coding_agent = create_agent(autonomous_engineer_system_prompt, tools)
coding_node = create_agent_node(coding_agent, coding_agent_name)


# Router function
def router(state) -> Literal["call_tool", "__end__", "continue",]:
    # print("state",state)
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "call_tool"
    if "PATCH COMPLETED" in last_message.content:
        return "__end__"
    return "continue"


# Create workflow
workflow = StateGraph(AgentState)

# add agents
workflow.add_node(coding_agent_name, coding_node)
workflow.add_node(tool_node_name, tool_node)


# add start and end
workflow.add_edge(START, coding_agent_name)


# add conditional edges for tool calling
workflow.add_conditional_edges(
    tool_node_name,
    lambda x: x["sender"],
    {coding_agent_name: coding_agent_name},
)


workflow.add_conditional_edges(
    coding_agent_name,
    router,
    {
        "continue": coding_agent_name,
        "call_tool": tool_node_name,
        "__end__": END,
    },
)

graph = workflow.compile()


from IPython.display import Image, display

# Import necessary modules
import os
from PIL import Image
from io import BytesIO

# Generate the Mermaid PNG
png_data = graph.get_graph().draw_mermaid_png(
    draw_method=MermaidDrawMethod.API,
)

# Create a PIL Image from the PNG data
image = Image.open(BytesIO(png_data))

# Save the image
output_path = "workflow_graph.png"
image.save(output_path)

print(f"Workflow graph saved as {output_path}")

