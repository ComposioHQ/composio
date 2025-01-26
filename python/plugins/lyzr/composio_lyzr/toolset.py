"""
Lyzr tool spec.
"""

import types
import typing as t
import warnings
from inspect import Signature

import typing_extensions as te
from lyzr_automata import Tool

from composio import Action, ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.toolset import ProcessorsType
from composio.utils import help_msg
from composio.utils.shared import (
    get_signature_format_from_schema_params,
    json_schema_to_model,
)


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="lyzr",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for Lyzr framework.
    """

    def _wrap_tool(
        self,
        schema: t.Dict,
        entity_id: t.Optional[str] = None,
    ) -> Tool:
        """
        Wrap composio tool as Lyzr `Tool` object.
        """
        name = schema["name"]
        description = schema["description"]

        def function(**kwargs: t.Any) -> t.Dict:
            """Composio tool wrapped as Lyzr tool."""
            return self.execute_action(
                action=Action(value=name),
                params=kwargs,
                entity_id=entity_id or self.entity_id,
                _check_requested_actions=True,
            )

        action_func = types.FunctionType(
            function.__code__,
            globals=globals(),
            name=name,
            closure=function.__closure__,
        )
        action_func.__signature__ = Signature(  # type: ignore
            parameters=get_signature_format_from_schema_params(
                schema_params=schema["parameters"],
            )
        )
        action_func.__doc__ = description
        return Tool(
            name=name,
            desc=description,
            function=action_func,
            function_input=json_schema_to_model(
                json_schema=schema["parameters"],
            ),
            function_output=json_schema_to_model(
                json_schema=schema["response"],
            ),
            default_params={},
        )

    @te.deprecated("Use `ComposioToolSet.get_tools` instead.\n", category=None)
    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.List[Tool]:
        """
        Get composio tools wrapped as Lyzr `Tool` objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `Tool` objects
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
    ) -> t.List[Tool]:
        """
        Get composio tools wrapped as Lyzr `Tool` objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `Tool` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._processor_helpers.merge_processors(processors)
        return [
            self._wrap_tool(
                schema=schema.model_dump(exclude_none=True),
                entity_id=entity_id or self.entity_id,
            )
            for schema in self.get_action_schemas(
                actions=actions,
                apps=apps,
                tags=tags,
                check_connected_accounts=check_connected_accounts,
                _populate_requested=True,
            )
        ]
