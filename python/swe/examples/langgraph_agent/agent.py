"""CrewAI SWE Agent"""

import operator
import os
from typing import Annotated, Literal, Sequence, TypedDict

import dotenv
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from prompts import frontend_engineer_prompt, pm_prompt

from composio_langgraph import Action, App, ComposioToolSet, WorkspaceType


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tool.
openai_client = ChatOpenAI(
    api_key=os.environ["OPENAI_API_KEY"],  # type: ignore
    model="gpt-4-turbo",
)
composio_toolset = ComposioToolSet(
    workspace_config=WorkspaceType.Docker(
        image="composio/composio:dev", persistent=True
    )
)

# Get required tools
coder_tools = [
    *composio_toolset.get_actions(
        actions=[
            Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
            Action.FILETOOL_FIND_FILE,
            Action.FILETOOL_CREATE_FILE,
            Action.FILETOOL_EDIT_FILE,
            Action.FILETOOL_OPEN_FILE,
            Action.FILETOOL_SCROLL,
            Action.FILETOOL_WRITE,
            Action.FILETOOL_LIST_FILES,
        ]
    ),
    *composio_toolset.get_tools(
        apps=[
            App.SHELLTOOL,
            App.BROWSERTOOL,
        ]
    ),
]

coder_tool_node = ToolNode(coder_tools)

pm_tools = composio_toolset.get_tools(
    apps=[
        App.BROWSERTOOL,
        App.IMAGEANALYSERTOOL,
    ]
)

pm_tool_node = ToolNode(pm_tools)


# Define AgentState
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    sender: str


# Agent names
coding_agent_name = "Coder"
coder_tool_node_name = "coder_tool"
pm_agent_name = "PM"
pm_tool_node_name = "pm_tool"


# Helper function for agent nodes
def create_agent_node(agent, name):
    def agent_node(state):
        result = agent.invoke(state)
        if not isinstance(result, ToolMessage):
            result = AIMessage(**result.dict(exclude={"type", "name"}), name=name)
        return {"messages": [result], "sender": name}

    return agent_node


# Create agents
def create_agent(system_prompt, tools):
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="messages"),
        ]
    )
    llm = ChatOpenAI(temperature=0, streaming=True, model="gpt-4-1106-preview")
    return prompt | llm.bind_tools(tools)


coding_agent = create_agent(frontend_engineer_prompt, coder_tools)
coding_node = create_agent_node(coding_agent, coding_agent_name)

pm_agent = create_agent(pm_prompt, pm_tools)
pm_node = create_agent_node(pm_agent, pm_agent_name)


# Router function
def router(
    state,
) -> Literal["call_tool", "pm", "__end__", "continue",]:
    last_message = state["messages"][-1]
    sender = state["sender"]
    if last_message.tool_calls:
        return "call_tool"
    if (
        "LANDING PAGE READY FOR REVIEW" in last_message.content
        and sender == coding_agent_name
    ):
        return "pm"
    if "LANDING PAGE LOOKS GOOD" in last_message.content and sender == pm_agent_name:
        return "__end__"
    return "continue"


# Create workflow
workflow = StateGraph(AgentState)

# add agents
workflow.add_node(coding_agent_name, coding_node)
workflow.add_node(coder_tool_node_name, coder_tool_node)
workflow.add_node(pm_agent_name, pm_node)
workflow.add_node(pm_tool_node_name, pm_tool_node)

# add start and end
workflow.add_edge(START, coding_agent_name)

# add conditional edges for tool calling
workflow.add_conditional_edges(
    coder_tool_node_name,
    lambda x: x["sender"],
    {coding_agent_name: coding_agent_name},
)

workflow.add_conditional_edges(
    pm_tool_node_name, lambda x: x["sender"], {pm_agent_name: pm_agent_name}
)

workflow.add_conditional_edges(
    coding_agent_name,
    router,
    {
        "continue": coding_agent_name,
        "call_tool": coder_tool_node_name,
        "pm": pm_agent_name,
    },
)

workflow.add_conditional_edges(
    pm_agent_name,
    router,
    {
        "continue": coding_agent_name,
        "call_tool": pm_tool_node_name,
        "__end__": END,
    },
)

graph = workflow.compile()

if __name__ == "__main__":
    try:
        final_state = graph.invoke(
            {
                "messages": [
                    HumanMessage(
                        content="""Create a personal website for Karan Vaidya, co-founder of Composio.
He graduated from IIT Bombay in 2017 with a B.Tech in Computer Science and Engineering.
He started his career in Rubrik as a SWE and later became founding PM at Nirvana Insurance.
At Composio, he is leading Tech and Product teams and is responsible for building products
around AI Agents.
Make the site with multiple pages, include a blog, a contact page, and a home page.
Make the website as classy as possible, use a minimalist approach, think through the design before you start coding.
Image of Karan: /root/karan_image.jpeg"""
                    )
                ]
            },
            {"recursion_limit": 75},
        )

        print(final_state["messages"][-1].content)
    except Exception as e:
        print("Error:", e)
