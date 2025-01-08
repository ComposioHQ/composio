"""
PhiData tool spec.
"""

import json
import typing as t
import warnings

import typing_extensions as te
from phi.tools.toolkit import Toolkit
from pydantic import validate_call

from composio import Action, ActionType, AppType
from composio import ComposioToolSet as BaseComposioToolSet
from composio import TagType
from composio.tools.toolset import ProcessorsType
from composio.utils import help_msg


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="phidata",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for Phidata framework.
    """

    def _wrap_tool(
        self,
        schema: t.Dict,
        entity_id: t.Optional[str] = None,
    ) -> Toolkit:
        """
        Wrap composio tool as Phidata `Toolkit` object.
        """
        name = schema["name"]
        description = schema["description"]
        parameters = schema["parameters"]

        # Create a new Toolkit instance
        toolkit = Toolkit(name=name)

        @validate_call
        def function(**kwargs: t.Any) -> str:
            """Composio tool wrapped as Phidata `Function`.

            Args:
                **kwargs: Function parameters based on the schema

            Returns:
                str: JSON string containing the function execution result
            """
            return json.dumps(
                self.execute_action(
                    action=Action(value=name),
                    params=kwargs,
                    entity_id=entity_id or self.entity_id,
                    _check_requested_actions=True,
                )
            )

        # Set function docstring from schema
        param_docs = []
        if "properties" in parameters:
            for param_name, param_info in parameters["properties"].items():
                param_desc = param_info.get("description", "No description available")
                param_type = param_info.get("type", "any")
                param_docs.append(f":param {param_name}: {param_desc} ({param_type})")

        function.__doc__ = f"{description}\n\n" + "\n".join(param_docs)

        # Register the function with the toolkit
        toolkit.register(function)

        return toolkit

    @te.deprecated("Use `ComposioToolSet.get_tools` instead.\n", category=None)
    def get_actions(self, actions: t.Sequence[ActionType]) -> t.List[Toolkit]:
        """
        Get composio tools wrapped as Phidata `Toolkit` objects.

        Args:
            actions: List of actions to wrap

        Returns:
            List[Toolkit]: Composio tools wrapped as `Toolkit` objects
        """
        warnings.warn(
            "Use `ComposioToolSet.get_tools` instead.\n" + help_msg(),
            DeprecationWarning,
            stacklevel=2,
        )
        return self.get_tools(actions=actions)

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> t.List[Toolkit]:
        """
        Get composio tools wrapped as Phidata `Toolkit` objects.

        Args:
            actions: List of actions to wrap
            apps: List of apps to wrap
            tags: Filter the apps by given tags
            processors: Optional processors to apply
            check_connected_accounts: Whether to check for connected accounts

        Returns:
            List[Toolkit]: Composio tools wrapped as `Toolkit` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._merge_processors(processors)
        return [
            self._wrap_tool(
                schema=schema.model_dump(
                    exclude_none=True,
                ),
                entity_id=self.entity_id,
            )
            for schema in self.get_action_schemas(
                actions=actions,
                apps=apps,
                tags=tags,
                check_connected_accounts=check_connected_accounts,
                _populate_requested=True,
            )
        ]
