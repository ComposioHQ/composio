import os
import typing as t
import warnings

import typing_extensions as te

from composio import Action, ActionType, AppType
from composio import ComposioToolSet as BaseComposioToolSet
from composio import TagType
from composio.exceptions import InvalidSchemaError
from composio.tools.toolset import ProcessorsType
from composio.utils import help_msg


_openapi_to_python = {
    "string": "str",
    "number": "int",
    "integer": "int",
    "boolean": "bool",
}


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="praisonai",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for PraisonAI framework.
    """

    _tools_file = "tools.py"
    _imports = [
        "import typing as t",
        "from typing import Type",
        "from praisonai_tools import BaseTool",
        "from composio_praisonai import ComposioToolSet",
        "from langchain.pydantic_v1 import BaseModel, Field",
    ]

    def _create_tool_file(self) -> None:
        if not os.path.exists(self._tools_file):
            with open(self._tools_file, "w", encoding="utf-8") as tool_file:
                tool_file.write("\n".join(self._imports) + "\n\n")

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
                raise InvalidSchemaError(
                    "Some dtype of current schema are not handled yet. "
                    f"Current Schema: {param_body}"
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
            _check_requested_actions=True,
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
        Generates PraisonAI tools from Composio Actions

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
        if not os.path.exists(self._tools_file):
            self._create_tool_file()

        with open(self._tools_file, "r+", encoding="utf-8") as tool_file:
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

    @te.deprecated("Use `ComposioToolSet.get_tools` instead.\n", category=None)
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
        warnings.warn(
            "Use `ComposioToolSet.get_tools` instead.\n" + help_msg(),
            DeprecationWarning,
            stacklevel=2,
        )
        return self.get_tools(actions=actions, entity_id=entity_id)

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> t.List[str]:
        """
        Get composio tools written as ParisonAi supported tools.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Name of the tools written
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._processor_helpers.merge_processors(processors)
        return [
            self._write_tool(
                schema=tool.model_dump(exclude_none=True),
                entity_id=entity_id or self.entity_id,
            )
            for tool in self.get_action_schemas(
                actions=actions,
                apps=apps,
                tags=tags,
                check_connected_accounts=check_connected_accounts,
                _populate_requested=True,
            )
        ]
