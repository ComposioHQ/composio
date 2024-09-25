"""CrewAI SWE Agent"""

import operator
import os
from typing import Annotated, Literal, Sequence, TypedDict

import dotenv
from dotenv import load_dotenv
from langchain.globals import set_llm_cache
from langchain_aws import BedrockChat
from langchain_community.cache import SQLiteCache
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.graph import CurveStyle, MermaidDrawMethod, NodeStyles
from langchain_core.tools import StructuredTool
import typing as t
#from custom_tools import say
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from deterministic_prompts import ISSUE_ANALYSIS_PROMPT, CODE_ANALYSIS_PROMPT, TEST_CREATION_PROMPT, CODE_EDITING_PROMPT, TEST_EXECUTION_PROMPT

from composio_langgraph import Action, App, ComposioToolSet, WorkspaceType

# Load environment variables from .env
dotenv.load_dotenv()

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    sender: str

def find_toolcall_in_messages(aimessage: AIMessage, tools: t.Sequence[StructuredTool]):
    if aimessage.tool_calls:
        return aimessage.tool_calls[0]["name"]
    # if any(tool_call.name in aimessage.content for tool_call in tools):
    #     for tool_call in tools:
    #         if tool_call.name in aimessage.content:
    #             return tool_call.name
    return None


def add_thought_to_request(request: t.Dict[str, t.Any]) -> t.Dict[str, t.Any]:
    request["thought"] = {
        "type": "string",
        "description": "Provide the thought of the agent in a single one-liner. This is a required field.",
        "required": True
    }
    return request

def pop_thought_from_request(request: t.Dict[str, t.Any]) -> t.Dict[str, t.Any]:
    print(request)
    request.pop("thought", None)
    return request

def get_agent_graph(repo_name: str, workspace_id: str):

    bedrock_client = BedrockChat(
                credentials_profile_name="default",
                model_id="anthropic.claude-3-5-sonnet-20240620-v1:0",
                region_name="us-east-1",
                model_kwargs={"temperature": 0}
            )

    composio_toolset = ComposioToolSet(workspace_config=WorkspaceType.Docker(),
                                            metadata={
                                                App.CODE_ANALYSIS_TOOL:{
                                                    "dir_to_index_path" : f"/home/user/{repo_name}",
                                                }
                                            },
                                            processors={
                                                "pre": {
                                                    App.FILETOOL: pop_thought_from_request,
                                                    App.CODE_ANALYSIS_TOOL: pop_thought_from_request,
                                                    App.SHELLTOOL: pop_thought_from_request,
                                                },
                                                "schema": {
                                                    App.FILETOOL: add_thought_to_request,
                                                    App.CODE_ANALYSIS_TOOL: add_thought_to_request,
                                                    App.SHELLTOOL: add_thought_to_request,
                                                }
                                            }
                                        )
    composio_toolset.set_workspace_id(workspace_id)


    # Helper function for agent nodes
    def create_agent_node(agent, name):
        def agent_node(state):
            
            # If last message is AI message, add a placeholder human message
            if isinstance(state["messages"][-1], AIMessage):
                state["messages"].append(HumanMessage(content="Placeholder message"))
            result = agent.invoke(state)
            if not isinstance(result, ToolMessage):
                if isinstance(result, dict):
                    result_dict = result
                else:
                    result_dict = result.dict()
                result = AIMessage(**{k: v for k, v in result_dict.items() if k not in ["type", "name"]}, name=name)
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
        llm = bedrock_client
        if tools:
            # return prompt | llm.bind_tools(tools)
            return prompt | llm.bind_tools(tools)
        else:
            return prompt | llm


    workflow = StateGraph(AgentState)


    ########################################################
    node_name = "IssueAnalysisAgent"
    node_tool_name = "issue_analysis_tool"

    def issue_analysis_router(state) -> Literal["issue_analysis_tool", "done", "continue"]:
        messages = state["messages"]
        last_ai_message = next((msg for msg in reversed(messages) if isinstance(msg, AIMessage)), messages[-1])
        tool_name = find_toolcall_in_messages(last_ai_message, issue_analysis_tools)
        if tool_name:
            return "issue_analysis_tool"
        if "ANALYSIS COMPLETE" in last_ai_message.content:
            return "done"
        return "continue"

    issue_analysis_tools = [
            *composio_toolset.get_actions(
                actions=[
                    Action.FILETOOL_GIT_REPO_TREE,
                    Action.FILETOOL_OPEN_FILE
                ]
            ),
        ]
    issue_analysis_tools_node = ToolNode(issue_analysis_tools)
    issue_analysis_agent = create_agent(
        ISSUE_ANALYSIS_PROMPT, 
        issue_analysis_tools
    )
    issue_analysis_node = create_agent_node(issue_analysis_agent, node_name)
    workflow.add_node(node_name, issue_analysis_node)
    workflow.add_node(node_tool_name, issue_analysis_tools_node)
    workflow.add_edge(START, node_name)
    workflow.add_conditional_edges(
        node_tool_name,
        lambda x: x["sender"],
        {node_name: node_name},
    )
    workflow.add_conditional_edges(
        node_name,
        issue_analysis_router,
        {
            node_tool_name: node_tool_name,
            "continue": node_name,
            "done": "CodeAnalysisAgent",
        },
    )


    ########################################################
    node_name = "CodeAnalysisAgent"
    node_tool_name = "code_analysis_tool"

    def code_analysis_router(state) -> Literal["code_analysis_tool", "done", "continue"]:
        messages = state["messages"]
        last_ai_message = next((msg for msg in reversed(messages) if isinstance(msg, AIMessage)), messages[-1])
        tool_name = find_toolcall_in_messages(last_ai_message, code_analysis_tools)
        if tool_name:
            return "code_analysis_tool"
        if "ANALYSIS COMPLETE" in last_ai_message.content:
            return "done"
        return "continue"

    code_analysis_tools = [
            *composio_toolset.get_actions(
                actions=[
                    Action.CODE_ANALYSIS_TOOL_GET_CLASS_INFO,
                    Action.CODE_ANALYSIS_TOOL_GET_METHOD_BODY,
                    Action.CODE_ANALYSIS_TOOL_GET_METHOD_SIGNATURE,
                ]
            ),
        ]

    code_analysis_tools_node = ToolNode(code_analysis_tools)
    code_analysis_agent = create_agent(
        CODE_ANALYSIS_PROMPT, 
        code_analysis_tools
    )
    code_analysis_node = create_agent_node(code_analysis_agent, node_name)
    workflow.add_node(node_name, code_analysis_node)
    workflow.add_node(node_tool_name, code_analysis_tools_node)
    workflow.add_conditional_edges(
        node_tool_name,
        lambda x: x["sender"],
        {node_name: node_name},
    )
    workflow.add_conditional_edges(
        node_name,
        code_analysis_router,
        {
            node_tool_name: node_tool_name,
            "continue": node_name,
            "done": "TestCreationAgent",
        },
    )



    ########################################################
    node_name = "TestCreationAgent"
    node_tool_name = "test_creation_tool"

    def test_creation_router(state) -> Literal["test_creation_tool", "done", "continue"]:
        messages = state["messages"]
        last_ai_message = next((msg for msg in reversed(messages) if isinstance(msg, AIMessage)), messages[-1])
        tool_name = find_toolcall_in_messages(last_ai_message, test_creation_tools)
        if tool_name:
            return "test_creation_tool"
        if "TESTCASE COMPLETE" in last_ai_message.content:
            return "done"
        return "continue"

    test_creation_tools = [
            *composio_toolset.get_actions(
                actions=[
                    Action.FILETOOL_GIT_REPO_TREE,
                ]
            ),
        ]
    test_creation_tools_node = ToolNode(test_creation_tools)
    test_creation_agent = create_agent(
        TEST_CREATION_PROMPT, 
        test_creation_tools
    )
    test_creation_node = create_agent_node(test_creation_agent, node_name)
    workflow.add_node(node_name, test_creation_node)
    workflow.add_node(node_tool_name, test_creation_tools_node)
    workflow.add_conditional_edges(
        node_tool_name,
        lambda x: x["sender"],
        {node_name: node_name},
    )
    workflow.add_conditional_edges(
        node_name,
        test_creation_router,
        {
            node_tool_name: node_tool_name,
            "continue": node_name,
            "done": "CodeEditingAgent",
        },
    )


    ########################################################
    node_name = "CodeEditingAgent"
    node_edit_tool_name = "code_editing_tool"
    node_analyse_tool_name = "code_analysis_editor_tool"

    def code_editing_router(state) -> Literal["code_editing_tool", "code_analysis_editor_tool", "done", "continue"]:
        messages = state["messages"]
        last_ai_message = next((msg for msg in reversed(messages) if isinstance(msg, AIMessage)), messages[-1])
        tool_name = find_toolcall_in_messages(last_ai_message, code_editing_tools)
        if tool_name:
            if tool_name in [x.name for x in code_analysis_tools]:
                return "code_analysis_editor_tool"
            else:
                return "code_editing_tool"
        if "EDITING COMPLETED" in last_ai_message.content:
            return "done"
        return "continue"

    code_editing_tools = [
            *composio_toolset.get_actions(
                actions=[
                    Action.FILETOOL_GIT_REPO_TREE,
                    Action.FILETOOL_OPEN_FILE,
                    Action.FILETOOL_SCROLL,
                    Action.FILETOOL_LIST_FILES,
                    Action.FILETOOL_FIND_FILE,
                    Action.FILETOOL_SEARCH_WORD,
                    Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
                    Action.FILETOOL_EDIT_FILE,
                ]
            ),
        ]
    code_analysis_tools = [
            *composio_toolset.get_actions(
                actions=[
                    Action.CODE_ANALYSIS_TOOL_GET_CLASS_INFO,
                    Action.CODE_ANALYSIS_TOOL_GET_METHOD_BODY,
                    Action.CODE_ANALYSIS_TOOL_GET_METHOD_SIGNATURE,
                ]
            ),
        ]
    code_editing_tools_node = ToolNode(code_editing_tools)
    code_analysis_tools_node = ToolNode(code_analysis_tools)
    code_editing_agent = create_agent(
        CODE_EDITING_PROMPT, 
        code_editing_tools
    )
    code_editing_node = create_agent_node(code_editing_agent, node_name)
    workflow.add_node(node_name, code_editing_node)
    workflow.add_node(node_edit_tool_name, code_editing_tools_node)
    workflow.add_node(node_analyse_tool_name, code_analysis_tools_node)
    workflow.add_conditional_edges(
        node_edit_tool_name,
        lambda x: x["sender"],
        {node_name: node_name},
    )
    workflow.add_conditional_edges(
        node_analyse_tool_name,
        lambda x: x["sender"],
        {node_name: node_name},
    )
    workflow.add_conditional_edges(
        node_name,
        code_editing_router,
        {
            node_edit_tool_name: node_edit_tool_name,
            node_analyse_tool_name: node_analyse_tool_name,
            "continue": node_name,
            "done": "TestExecutionAgent"
        },
    )

    ########################################################
    node_name = "TestExecutionAgent"
    node_tool_name = "test_execution_tool"

    def test_execution_router(state) -> Literal["test_execution_tool", "done", "failed", "continue"]:
        messages = state["messages"]
        last_ai_message = next((msg for msg in reversed(messages) if isinstance(msg, AIMessage)), messages[-1])
        tool_name = find_toolcall_in_messages(last_ai_message, test_execution_tools)
        if tool_name:
            return "test_execution_tool"
        if "TEST FAILED" in last_ai_message.content:
            return "failed"
        if "TEST PASSED" in last_ai_message.content:
            return "done"
        return "continue"

    test_execution_tools = [
            *composio_toolset.get_actions(
                actions=[
                    Action.FILETOOL_GIT_REPO_TREE,
                    Action.FILETOOL_OPEN_FILE,
                    Action.FILETOOL_SCROLL,
                    Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
                    Action.SHELLTOOL_EXEC_COMMAND,
                ]
            ),
        ]
    test_execution_tools_node = ToolNode(test_execution_tools)
    test_execution_agent = create_agent(
        TEST_EXECUTION_PROMPT, 
        test_execution_tools
    )
    test_execution_node = create_agent_node(test_execution_agent, node_name)
    workflow.add_node(node_name, test_execution_node)
    workflow.add_node(node_tool_name, test_execution_tools_node)
    workflow.add_conditional_edges(
        node_tool_name,
        lambda x: x["sender"],
        {node_name: node_name},
    )
    workflow.add_conditional_edges(
        node_name,
        test_execution_router,
        {
            node_tool_name: node_tool_name,
            "continue": node_name,
            "done": "__end__",
            "failed": "TestCreationAgent",
        },
    )

    graph = workflow.compile()

    
    from io import BytesIO

    from IPython.display import Image
    from PIL import Image


    # Generate the Mermaid PNG
    png_data = graph.get_graph().draw_mermaid_png(
        draw_method=MermaidDrawMethod.API,
    )

    # Create a PIL Image from the PNG data
    image = Image.open(BytesIO(png_data))

    # Save the image
    output_path = "deterministic_workflow_graph.png"
    image.save(output_path)

    return graph, composio_toolset