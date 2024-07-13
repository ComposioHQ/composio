import typing as t

from composio_langchain import ComposioToolSet as BaseComposioToolSet

from composio.constants import DEFAULT_ENTITY_ID
from composio.tools.env.factory import ExecEnv


class ComposioToolSet(BaseComposioToolSet):
    """
    Composio toolset for LangGraph framework.

    Example:
    ```python
    import json
    import operator
    from typing import Annotated, TypedDict, Sequence

    from langchain_openai import ChatOpenAI
    from langchain_core.utils.function_calling import convert_to_openai_function
    from langchain_core.messages import BaseMessage, HumanMessage, FunctionMessage

    from langgraph.graph import StateGraph, END
    from langgraph.prebuilt import ToolInvocation, ToolExecutor
    from composio_langgraph import Action, ComposioToolSet

    composio_toolset = ComposioToolSet()
    tools = composio_toolset.get_actions(
        actions=[Action.GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER]
    )
    tool_executor = ToolExecutor(tools)
    functions = [convert_to_openai_function(t) for t in tools]

    model = ChatOpenAI(temperature=0, streaming=True)
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

        # We call the tool_executor and get back a response
        response = tool_executor.invoke(action)

        # We use the response to create a FunctionMessage
        function_message = FunctionMessage(
            content=str(response),
            name=action.tool
            )

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
    ```
    """

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        entity_id: str = DEFAULT_ENTITY_ID,
        output_in_file: bool = False,
        workspace_env: ExecEnv = ExecEnv.HOST,
        workspace_id: t.Optional[str] = None,
    ) -> None:
        """
        Initialize composio toolset.

        :param api_key: Composio API key
        :param base_url: Base URL for the Composio API server
        :param entity_id: Entity ID for making function calls
        :param output_in_file: Whether to write output to a file
        """
        super().__init__(
            api_key=api_key,
            base_url=base_url,
            entity_id=entity_id,
            output_in_file=output_in_file,
            workspace_env=workspace_env,
            workspace_id=workspace_id,
        )

        self._runtime = "langgraph"
