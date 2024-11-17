"""LangGraph SWE Agent"""

import operator
import traceback
import typing as t
from typing import Annotated, Literal, Sequence, TypedDict

import dotenv
from langchain_aws import ChatBedrock
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from prompts import CODE_ANALYZER_PROMPT, EDITING_AGENT_PROMPT, SOFTWARE_ENGINEER_PROMPT

from composio_langgraph import Action, App, ComposioToolSet, WorkspaceType


# Load environment variables from .env
dotenv.load_dotenv()

MODEL = "claude"


def add_thought_to_request(request: t.Dict[str, t.Any]) -> t.Dict[str, t.Any]:
    request["thought"] = {
        "type": "string",
        "description": "Provide the thought of the agent in a small paragraph in concise way. This is a required field.",
        "required": True,
    }
    return request


def pop_thought_from_request(request: t.Dict[str, t.Any]) -> t.Dict[str, t.Any]:
    request.pop("thought", None)
    return request


def get_agent_graph(repo_name: str, workspace_id: str):

    import random
    import string

    random_string = "".join(random.choices(string.digits, k=6))
    run_file = f"messages_{random_string}.txt"

    if MODEL == "claude":
        client = ChatBedrock(
            credentials_profile_name="default",
            model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
            region_name="us-west-2",
            model_kwargs={"temperature": 0, "max_tokens": 8192},
        )
    elif MODEL == "gpt-4o":
        client = ChatOpenAI(
            model="gpt-4o",
            temperature=0.1,
            max_completion_tokens=8192,
        )
    else:
        client = ChatBedrock(
            credentials_profile_name="default",
            model_id="arn:aws:bedrock:us-west-2:008971668139:inference-profile/us.meta.llama3-2-3b-instruct-v1:0",
            model_kwargs={"temperature": 0},
            provider="meta",
        )

    composio_toolset = ComposioToolSet(
        workspace_config=WorkspaceType.Docker(),
        metadata={
            App.CODE_ANALYSIS_TOOL: {
                "dir_to_index_path": f"/home/user/{repo_name}",
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
            },
        },
    )
    composio_toolset.set_workspace_id(workspace_id)

    swe_tools = [
        *composio_toolset.get_actions(
            actions=[
                # Action.FILETOOL_OPEN_FILE,
                Action.FILETOOL_GIT_REPO_TREE,
                Action.FILETOOL_GIT_PATCH,
            ]
        ),
    ]
    # Separate tools into two groups
    code_analysis_tools = [
        *composio_toolset.get_actions(
            actions=[
                Action.CODE_ANALYSIS_TOOL_GET_CLASS_INFO,
                Action.CODE_ANALYSIS_TOOL_GET_METHOD_BODY,
                Action.CODE_ANALYSIS_TOOL_GET_METHOD_SIGNATURE,
                # Action.CODE_ANALYSIS_TOOL_GET_RELEVANT_CODE
            ]
        ),
    ]
    file_tools = [
        *composio_toolset.get_actions(
            actions=[
                Action.FILETOOL_GIT_REPO_TREE,
                Action.FILETOOL_LIST_FILES,
                Action.FILETOOL_CHANGE_WORKING_DIRECTORY,
                Action.FILETOOL_OPEN_FILE,
                Action.FILETOOL_SCROLL,
                Action.FILETOOL_EDIT_FILE,
                Action.FILETOOL_CREATE_FILE,
                Action.FILETOOL_FIND_FILE,
                Action.FILETOOL_SEARCH_WORD,
                Action.FILETOOL_WRITE,
            ]
        ),
    ]

    # Create two separate tool nodes
    code_analysis_tool_node = ToolNode(code_analysis_tools)
    file_tool_node = ToolNode(file_tools)
    swe_tool_node = ToolNode(swe_tools)

    # Define AgentState
    class AgentState(TypedDict):
        messages: Annotated[Sequence[BaseMessage], operator.add]
        sender: str
        consecutive_visits: dict

    # Agent names
    software_engineer_name = "SoftwareEngineer"
    code_analyzer_name = "CodeAnalyzer"
    editor_name = "Editor"

    # Helper function for agent nodes
    def create_agent_node(agent, name):
        def agent_node(state):
            from tenacity import retry, stop_after_attempt, wait_exponential

            @retry(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=1, min=4, max=10),
            )
            def invoke_with_retry(agent, state):
                return agent.invoke(state)

            # If last message is AI message, add a placeholder human message
            if MODEL == "claude" and isinstance(state["messages"][-1], AIMessage):
                state["messages"].append(HumanMessage(content="Placeholder message"))

            try:
                result = invoke_with_retry(agent, state)
            except Exception:
                print(
                    f"Failed to invoke agent after 3 attempts: {traceback.format_exc()}"
                )
                result = AIMessage(
                    content="I apologize, but I encountered an error and couldn't complete the task. Please try again or rephrase your request.",
                    name=name,
                )

            if not isinstance(result, ToolMessage):
                if isinstance(result, dict):
                    result_dict = result
                else:
                    result_dict = result.dict()
                result = AIMessage(
                    **{
                        k: v
                        for k, v in result_dict.items()
                        if k not in ["type", "name"]
                    },
                    name=name,
                )
            with open(run_file, "w") as handle:
                message_str = ""
                for message in state["messages"]:
                    message_type = type(message).__name__
                    message_str += f"{message_type}: {str(message.content)}\n"
                handle.write(message_str)
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
        llm = client
        if tools:
            # return prompt | llm.bind_tools(tools)
            return prompt | llm.bind_tools(tools)
        else:
            return prompt | llm

    software_engineer_agent = create_agent(SOFTWARE_ENGINEER_PROMPT, swe_tools)
    software_engineer_node = create_agent_node(
        software_engineer_agent, software_engineer_name
    )

    # Create the new code analyzer agent
    code_analyzer_agent = create_agent(CODE_ANALYZER_PROMPT, code_analysis_tools)
    code_analyzer_node = create_agent_node(code_analyzer_agent, code_analyzer_name)

    editing_agent = create_agent(EDITING_AGENT_PROMPT, file_tools)
    editing_node = create_agent_node(editing_agent, editor_name)

    # Update router function
    def router(
        state,
    ) -> Literal[
        "code_edit_tool",
        "code_analysis_tool",
        "__end__",
        "continue",
        "analyze_code",
        "edit_file",
        "swe_tool",
    ]:
        messages = state["messages"]
        for message in reversed(messages):
            if isinstance(message, AIMessage):
                last_ai_message = message
                break
        else:
            # If no AIMessage is found, use the last message as before
            last_ai_message = messages[-1]

        if last_ai_message.tool_calls:
            return "swe_tool"
        if "ANALYZE CODE" in last_ai_message.content:
            return "analyze_code"
        if "EDIT FILE" in last_ai_message.content:
            return "edit_file"
        if "PATCH COMPLETED" in last_ai_message.content:
            return "__end__"
        return "continue"

    # Create workflow
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node(software_engineer_name, software_engineer_node)
    workflow.add_node(code_analyzer_name, code_analyzer_node)
    workflow.add_node(editor_name, editing_node)
    workflow.add_node("code_edit_tool", file_tool_node)
    workflow.add_node("code_analysis_tool", code_analysis_tool_node)
    workflow.add_node("swe_tool", swe_tool_node)
    # Add start and end
    workflow.add_edge(START, software_engineer_name)

    # Add conditional edges for tool calling
    workflow.add_conditional_edges(
        "code_edit_tool",
        lambda x: x["sender"],
        {editor_name: editor_name},
    )
    workflow.add_conditional_edges(
        "code_analysis_tool",
        lambda x: x["sender"],
        {code_analyzer_name: code_analyzer_name},
    )
    workflow.add_conditional_edges(
        "swe_tool",
        lambda x: x["sender"],
        {software_engineer_name: software_engineer_name},
    )

    # Update conditional edges for the coding agent
    workflow.add_conditional_edges(
        software_engineer_name,
        router,
        {
            "continue": software_engineer_name,
            "analyze_code": code_analyzer_name,
            "edit_file": editor_name,
            "swe_tool": "swe_tool",
            "__end__": END,
        },
    )

    def code_analyzer_router(state):
        messages = state["messages"]
        for message in reversed(messages):
            if isinstance(message, AIMessage):
                last_ai_message = message
                break
        else:
            last_ai_message = messages[-1]

        if last_ai_message.tool_calls:
            return "code_analysis_tool"
        if "ANALYSIS COMPLETE" in last_ai_message.content:
            return "done"
        if "EDIT FILE" in last_ai_message.content:
            return "edit_file"
        return "continue"

    # Add conditional edges for the code analyzer
    workflow.add_conditional_edges(
        code_analyzer_name,
        code_analyzer_router,
        {
            "continue": code_analyzer_name,
            "done": software_engineer_name,
            "edit_file": editor_name,
            "code_analysis_tool": "code_analysis_tool",
        },
    )

    def code_editor_router(state):
        messages = state["messages"]
        for message in reversed(messages):
            if isinstance(message, AIMessage):
                last_ai_message = message
                break
        else:
            last_ai_message = messages[-1]

        if last_ai_message.tool_calls:
            tool_name = last_ai_message.tool_calls[0]["name"]  # noqa: F841
            return "code_edit_tool"
        if "EDITING COMPLETED" in last_ai_message.content:
            return "done"
        return "continue"

    workflow.add_conditional_edges(
        editor_name,
        code_editor_router,
        {
            "continue": editor_name,
            "done": software_engineer_name,
            "code_edit_tool": "code_edit_tool",
        },
    )

    graph = workflow.compile()
    return graph, composio_toolset, run_file
