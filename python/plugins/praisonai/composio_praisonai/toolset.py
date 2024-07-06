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
        entity_id: t.Any,
        tool_description: str,
        tool_input_model_name: str,
    ) -> str:
        """
        Generates the string representation of a BaseTool class.

        :param action_name: Identifier for the tool action.
        :param tool_name: Name of the tool class.
        :param tool_description: Description of the tool.
        :param tool_input_model_name: Name of the input model class.
        :return: String representation of the BaseTool class.
        """
        basetool_lines = [
            f"class {tool_name}(BaseTool):",
            f'\tname: str = "{tool_name}"',
            f'\tdescription: str = "{tool_description}"',
            f"\targs_schema: Type[BaseModel] = {tool_input_model_name}",
            "",
            "\tdef _run(self, **kwargs: t.Any) -> t.Any:",
            f"\t\ttoolset = ComposioToolSet(entity_id='{entity_id}')",
            "\t\treturn toolset.execute_tool(",
            f'\t\t\ttool_identifier="{action_name}",',
            "\t\t\tparams=kwargs,",
            "\t\t)",
        ]
        return "\n".join(basetool_lines)

    def _write_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ) -> str:
        """
        Generats PraisonAI tools from Composio Actions

        :param action_name: Identifier for the tool action.
        :param tool_name: Name of the tool class.
        :param tool_description: Description of the tool.
        :param tool_input_model_name: Name of the input model class.
        :return: String representation of the BaseTool class.
        """
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
            entity_id=entity_id,
            tool_description=description,
            tool_input_model_name=tool_input_model_name,
        )

        tool_str = input_model_str + "\n\n" + basetool_str
        with open(self.tool_file_path, "r+", encoding="utf-8") as tool_file:
            if tool_str not in tool_file.read():
                tool_file.write("\n\n" + tool_str)

        return tool_name

    def get_tools_section(self, tool_names: t.List) -> str:
        """
        Constructs a YAML section for the tools.

        :param tool_names: A list of tool names to include in the section.
        :return: A string representing the YAML section.
        """
        tools_section_parts = ["\n"]
        tools_section_parts.append("    tools:")
        for tool_name in tool_names:
            tools_section_parts.append(f"    - {tool_name}")

        return "\n".join(tools_section_parts)

    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.List[str]:
        """
        Get composio tools written as ParisonAi supported tools.

        :param actions: List of actions to write
        :param entity_id: Entity ID to use for executing function calls.
        :return: Name of the tools written
        """

        return [
            self._write_tool(
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
    ) -> t.List[str]:
        """
        Get composio tools written as ParisonAi supported tools.

        :param actions: List of actions to write
        :param entity_id: Entity ID to use for executing function calls.
        :return: Name of the tools written
        """

        return [
            self._write_tool(
                schema=tool.model_dump(exclude_none=True),
                entity_id=entity_id or self.entity_id,
            )
            for tool in self.get_action_schemas(apps=apps, tags=tags)
        ]
