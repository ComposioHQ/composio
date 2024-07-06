import os
import typing as t

from composio.client.enums import Action, ActionType, AppType, TagType
from composio.constants import DEFAULT_ENTITY_ID
from composio.tools import ComposioToolSet as BaseComposioToolSet


# from composio.tools.env.factory import ExecEnv


_openapi_to_python = {
    "string": "str",
    "number": "int",
    "integer": "int",
    "boolean": "bool",
}


class ComposioToolSet(BaseComposioToolSet):
    """
    Composio toolset for Langchain framework.

    Example:
    ```python
        import os
        import dotenv

        from composio_langchain import App, ComposioToolSet
        from langchain.agents import AgentExecutor, create_openai_functions_agent
        from langchain_openai import ChatOpenAI

        from langchain import hub


        # Load environment variables from .env
        dotenv.load_dotenv()


        # Pull relevant agent model.
        prompt = hub.pull("hwchase17/openai-functions-agent")

        # Initialize tools.
        openai_client = ChatOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        composio_toolset = ComposioToolSet()

        # Get All the tools
        tools = composio_toolset.get_tools(apps=[App.GITHUB])

        # Define task
        task = "Star a repo SamparkAI/docs on GitHub"

        # Define agent
        agent = create_openai_functions_agent(openai_client, tools, prompt)
        agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

        # Execute using agent_executor
        agent_executor.invoke({"input": task})
    ```
    """

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        entity_id: str = DEFAULT_ENTITY_ID,
        output_in_file: bool = False,
        # workspace_env: ExecEnv = ExecEnv.DOCKER,
        # workspace_id: t.Optional[str] = None,
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
            runtime="praisonai",
            entity_id=entity_id,
            output_in_file=output_in_file,
            # workspace_env=workspace_env,
            # workspace_id=workspace_id,
        )

        prefix_imports = [
            "import typing as t",
            "from typing import Type",
            "from praisonai_tools import BaseTool",
            "from composio_praisonai import ComposioToolSet",
            "from langchain.pydantic_v1 import BaseModel, Field",
        ]
        self.tool_file_path = "tools.py"
        if not os.path.exists(self.tool_file_path):
            with open(self.tool_file_path, "w", encoding="utf-8") as tool_file:
                tool_file.write("\n".join(prefix_imports) + "\n\n")

    def _process_input_schema(
        self,
        input_model_name: str,
        param_properties: t.Dict,
    ):
        input_model_lines = []
        input_model_lines.append(f"class {input_model_name}(BaseModel):")
        for param_name, param_body in param_properties.items():
            description = param_body["description"]
            dtype = param_body["type"]
            if dtype in _openapi_to_python:
                schema_dtype = _openapi_to_python.get(dtype)
            elif dtype == "array":
                schema_array_dtype = _openapi_to_python.get(
                    param_body["items"].get("type"),
                    None,
                )
                schema_dtype = (
                    f"list[{schema_array_dtype}]" if schema_array_dtype else "list"
                )
            else:
                raise TypeError(
                    f"Some dtype of current schema are not handled yet. Current Schema: {param_body}"
                )

            input_model_lines.append(
                f'\t{param_name}: {schema_dtype} = Field(description="{description}")'
            )

        return "\n".join(input_model_lines)

    def execute_tool(self, tool_identifier, params):
        return self.execute_action(
            action=Action(value=tool_identifier),
            params=params,
            entity_id=self.entity_id,
        )

    def _process_basetool(
        self,
        action_name: str,
        tool_name: str,
        tool_description: str,
        tool_input_model_name: str,
    ):
        basetool_lines = []
        basetool_lines.append(f"class {tool_name}(BaseTool):")
        basetool_lines.append(f'\tname: str = "{tool_name}"')
        basetool_lines.append(f'\tdescription: str = "{tool_description}"')
        basetool_lines.append(
            f"\targs_schema: Type[BaseModel] = {tool_input_model_name}"
        )
        basetool_lines.append("\n")
        basetool_lines.append("\tdef _run(self, **kwargs: t.Any):")
        basetool_lines.append(f"\t\ttoolset = ComposioToolSet()")
        basetool_lines.append(f"\t\treturn toolset.execute_tool(")
        basetool_lines.append(f'\t\t\ttool_identifier="{action_name}",')
        basetool_lines.append(f"\t\t\tparams=kwargs,")
        basetool_lines.append(f"\t\t\t)")

        return "\n".join(basetool_lines)

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ) -> str:
        """Wraps composio tool as Langchain StructuredTool object."""
        name = schema["name"]
        description = schema["description"].replace('"', "'").replace("\n", " ")

        tool_name = f"{name.upper()}_TOOL"
        tool_input_model_name = f"{name.upper()}_PARAMS"

        input_model_str = self._process_input_schema(
            input_model_name=tool_input_model_name,
            param_properties=schema["parameters"]["properties"],
        )

        basetool_str = self._process_basetool(
            action_name=name,
            tool_name=tool_name,
            tool_description=description,
            tool_input_model_name=tool_input_model_name,
        )

        tool_str = input_model_str + "\n\n" + basetool_str
        with open(self.tool_file_path, "r+", encoding="utf-8") as tool_file:
            if tool_str not in tool_file.read():
                tool_file.write("\n\n" + tool_str)

        return tool_name

    def get_tools_section(self, tool_names: t.List):
        tools_section_parts = ["\n"]
        tools_section_parts.append("    tools:")
        for tool_name in tool_names:
            tools_section_parts.append(f"    - {tool_name}")

        return "\n".join(tools_section_parts)

    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[str]:
        """
        Get composio tools wrapped as Langchain StructuredTool objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID to use for executing function calls.
        :return: Composio tools wrapped as `StructuredTool` objects
        """

        return [
            self._wrap_tool(
                schema=tool.model_dump(exclude_none=True),
                entity_id=entity_id or self.entity_id,
            )
            for tool in self.get_action_schemas(actions=actions)
        ]

    def get_tools(
        self,
        apps: t.Sequence[AppType],
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[str]:
        """
        Get composio tools wrapped as Langchain StructuredTool objects.

        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID to use for executing function calls.
        :return: Composio tools wrapped as `StructuredTool` objects
        """

        return [
            self._wrap_tool(
                schema=tool.model_dump(exclude_none=True),
                entity_id=entity_id or self.entity_id,
            )
            for tool in self.get_action_schemas(apps=apps, tags=tags)
        ]
