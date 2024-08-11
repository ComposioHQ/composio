"""
PhiData tool spec.
"""
import json
import typing as t

from phi.tools.function import Function
from pydantic import validate_call

from composio import Action, ActionType, AppType, TagType, WorkspaceConfigType
from composio.constants import DEFAULT_ENTITY_ID

from composio_openai import ComposioToolSet as BaseComposioToolSet


class ComposioToolSet(BaseComposioToolSet):
    """
    Composio toolset for Phidata framework.
    """

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        entity_id: str = DEFAULT_ENTITY_ID,
        output_in_file: bool = False,
        workspace_config: t.Optional[WorkspaceConfigType] = None,
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
            api_key,
            base_url,
            entity_id=entity_id,
            output_in_file=output_in_file,
            workspace_config=workspace_config,
            workspace_id=workspace_id,
        )
        self._runtime = "phidata"

    def _wrap_tool(
        self,
        schema: t.Dict,
        entity_id: t.Optional[str] = None,
    ) -> Function:
        """
        Wrap composio tool as Phidata `Function` object.
        """
        name = schema["name"]
        description = schema["description"]
        parameters = schema["parameters"]

        def function(**kwargs: t.Any) -> str:
            """Composio tool wrapped as Phidata `Function`."""
            return json.dumps(
                self.execute_action(
                    action=Action(value=name),
                    params=kwargs,
                    entity_id=entity_id or self.entity_id,
                )
            )

        return Function(
            name=name,
            description=description,
            parameters=parameters,
            entrypoint=validate_call(function),
        )

    def get_actions(
        self,
        actions: t.Sequence[ActionType],
    ) -> t.List[Function]:
        """
        Get composio tools wrapped as Phidata `Function` objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID to use for executing function calls.
        :return: Composio tools wrapped as `Function` objects
        """
        return [
            self._wrap_tool(
                schema=schema.model_dump(exclude_none=True),
                entity_id=self.entity_id,
            )
            for schema in self.get_action_schemas(actions=actions)
        ]

    def get_tools(
        self,
        apps: t.Sequence[AppType],
        tags: t.Optional[t.List[TagType]] = None,
    ) -> t.List[Function]:
        """
        Get composio tools wrapped as Lyzr `Function` objects.

        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID to use for executing function calls.
        :return: Composio tools wrapped as `Function` objects
        """
        return [
            self._wrap_tool(
                schema=schema.model_dump(exclude_none=True),
                entity_id=self.entity_id,
            )
            for schema in self.get_action_schemas(apps=apps, tags=tags)
        ]
