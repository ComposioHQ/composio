import asyncio
import json
import types
import typing as t
from inspect import Parameter, Signature
from typing import Dict, List, cast

from livekit.agents import FunctionTool, RunContext
from livekit.agents.llm import function_tool
from livekit.agents.llm.tool_context import _FunctionToolInfo

from composio import ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.toolset import ProcessorsType
from composio.utils.shared import get_signature_format_from_schema_params


# Type mapping for JSON schema array types to Python List types
JSON_SCHEMA_ARRAY_TYPE_MAP: Dict[str, t.Type[t.Any]] = {
    "string": t.List[str],
    "integer": t.List[int],
    "number": t.List[float],
    "boolean": t.List[bool],
}


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="livekit",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for LiveKit integration.
    """

    def _clean_schema_properties(self, prop_value: dict) -> None:
        """Clean individual property fields."""
        for field in ["examples", "pattern", "default"]:
            if field in prop_value:
                del prop_value[field]

        if "items" in prop_value and isinstance(prop_value["items"], dict):
            if "type" not in prop_value["items"]:
                prop_value["items"]["type"] = "string"

    def _clean_schema(self, schema_obj: t.Dict[str, t.Any]) -> None:
        """Remove examples and ensure array items have types."""
        if "properties" in schema_obj and isinstance(schema_obj["properties"], dict):
            for _, prop_value in schema_obj["properties"].items():
                if isinstance(prop_value, dict):
                    self._clean_schema_properties(prop_value)
                    self._clean_schema(prop_value)

        if "items" in schema_obj and isinstance(schema_obj["items"], dict):
            for field in ["examples", "pattern", "default"]:
                if field in schema_obj["items"]:
                    del schema_obj["items"][field]
            if "type" not in schema_obj["items"]:
                schema_obj["items"]["type"] = "string"
            self._clean_schema(schema_obj["items"])

        for value in schema_obj.values():
            if isinstance(value, dict):
                self._clean_schema(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        self._clean_schema(item)

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ) -> FunctionTool:
        """Wraps composio tool as LiveKit Function tool

        Args:
            schema: The action schema to wrap
            entity_id: Optional entity ID for executing function calls

        Returns:
            A LiveKit Function tool
        """
        action = schema["name"]
        description = schema["description"]
        schema_params = schema["parameters"]

        # Ensure the schema has additionalProperties set to false
        modified_schema = schema_params.copy()
        modified_schema["additionalProperties"] = False

        # Apply schema cleaning
        self._clean_schema(modified_schema)

        async def execute_action_wrapper(_ctx: RunContext, **kwargs) -> str:
            """Execute Composio action with the given arguments."""
            result = await asyncio.to_thread(
                self.execute_action,
                action=action,
                params=kwargs,
                entity_id=entity_id or self.entity_id,
            )
            if not isinstance(result, dict):
                result = {"result": result}
            return json.dumps(result)

        action_func = types.FunctionType(
            execute_action_wrapper.__code__,
            globals=globals(),
            name=action,
            closure=execute_action_wrapper.__closure__,
        )

        # Add LiveKit's required tool info
        info = _FunctionToolInfo(
            name=action,
            description=description,
        )
        setattr(action_func, "__livekit_agents_ai_callable", info)

        # Use schema parameters for signature
        parameters = get_signature_format_from_schema_params(
            schema_params=modified_schema, skip_default=True
        )

        # Map JSON schema array types to Python type hints (e.g., array<string> -> List[str])
        # Required for LiveKit's type-safe function signatures
        params = {}
        for param in parameters:
            annotation = param.annotation
            if annotation == List:
                prop_info = modified_schema["properties"].get(param.name, {})
                if prop_info.get("type") == "array" and "items" in prop_info:
                    items_type = prop_info["items"].get("type", "string")
                    annotation = JSON_SCHEMA_ARRAY_TYPE_MAP.get(items_type, str)
            params[param.name] = annotation

        action_func.__annotations__ = {
            "ctx": RunContext,
            "return": t.Dict[str, t.Any],
            **params,
        }

        # Create signature with context parameter first
        ctx_param = Parameter(
            name="ctx",
            kind=Parameter.POSITIONAL_OR_KEYWORD,
            annotation=RunContext,
        )
        sig = Signature(
            parameters=[ctx_param]
            + [param.replace(kind=Parameter.KEYWORD_ONLY) for param in parameters]
        )
        setattr(action_func, "__signature__", sig)

        decorated = function_tool()(action_func)
        return decorated

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> List[FunctionTool]:
        """
        Get Composio tools as LiveKit function tools.

        Args:
            actions: List of specific actions to get
            apps: List of apps to get tools from
            tags: Filter tools by tags
            entity_id: Entity ID to use for tool execution
            processors: Optional request/response processors
            check_connected_accounts: Whether to check for connected accounts

        Returns:
            A list of LiveKit function tools
        """
        # Validate and prepare
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._processor_helpers.merge_processors(processors)

        # Get action schemas from Composio and wrap as tools
        tools = [
            self._wrap_tool(
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

        return cast(List[FunctionTool], tools)
