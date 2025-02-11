"""
PhiData tool spec.
"""

import json
import typing as t
import warnings
from inspect import Signature

import typing_extensions as te
from phi.tools.function import Function
from phi.tools.tool import Tool
from phi.tools.toolkit import Toolkit
from pydantic import validate_call
from typing_extensions import Protocol

from composio import Action, ActionType, AppType
from composio import ComposioToolSet as BaseComposioToolSet
from composio import TagType
from composio.tools.toolset import ProcessorsType
from composio.utils import help_msg, shared


class ToolFunction(Protocol):
    """Protocol for tool functions with required attributes."""

    __signature__: Signature
    __annotations__: t.Dict[str, t.Any]
    __doc__: str

    def __call__(self, *args: t.Any, **kwargs: t.Any) -> str: ...


@te.deprecated(
    "composio_phidata is deprecated and will be removed on v0.8.0."
    "\nUse composio_agno instead."
)
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

        # Get function parameters from schema
        params = shared.get_signature_format_from_schema_params(parameters)

        # Create function signature and annotations
        sig = Signature(parameters=params)
        annotations = {p.name: p.annotation for p in params}
        annotations["return"] = str  # Add return type annotation

        @validate_call
        def function_template(*args, **kwargs) -> str:
            # Bind the arguments to the signature
            bound_args = sig.bind(*args, **kwargs)
            bound_args.apply_defaults()

            return json.dumps(
                self.execute_action(
                    action=Action(value=name),
                    params=bound_args.arguments,
                    entity_id=entity_id or self.entity_id,
                    _check_requested_actions=True,
                )
            )

        # Cast the function to our Protocol type to satisfy mypy
        func = t.cast(ToolFunction, function_template)

        # Apply the signature and annotations to the function
        func.__signature__ = sig
        func.__annotations__ = annotations
        func.__setattr__("__name__", name.lower())

        # Format docstring in Phidata standard format
        docstring_parts = [description, "\nArgs:"]
        if "properties" in parameters:
            for param_name, param_info in parameters["properties"].items():
                param_desc = param_info.get("description", "No description available")
                param_type = param_info.get("type", "any")
                docstring_parts.append(f"    {param_name} ({param_type}): {param_desc}")

        docstring_parts.append(
            "\nReturns:\n    str: JSON string containing the function execution result"
        )
        func.__doc__ = "\n".join(docstring_parts)

        # Register the function with the toolkit
        toolkit.register(func)

        return toolkit

    @te.deprecated("Use `ComposioToolSet.get_tools` instead.\n", category=None)
    def get_actions(
        self, actions: t.Sequence[ActionType]
    ) -> t.List[t.Union[Tool, Toolkit, t.Callable, t.Dict, Function]]:
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
    ) -> t.List[t.Union[Tool, Toolkit, t.Callable, t.Dict, Function]]:
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
            self._processor_helpers.merge_processors(processors)
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
