"""
PhiData tool spec.
"""

import json
import typing as t

import typing_extensions as te
from phi.tools.function import Function
from pydantic import validate_call

from composio import Action, ActionType, AppType, TagType
from composio.tools.toolset import ProcessorsType

from composio_openai import ComposioToolSet as BaseComposioToolSet


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="phidata",
    description_char_limit=1024,
):
    """
    Composio toolset for Phidata framework.
    """

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

    @te.deprecated("Use `ComposioToolSet.get_tools` instead")
    def get_actions(self, actions: t.Sequence[ActionType]) -> t.List[Function]:
        """
        Get composio tools wrapped as Phidata `Function` objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID to use for executing function calls.
        :return: Composio tools wrapped as `Function` objects
        """
        return self.get_tools(actions=actions)

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> t.List[Function]:
        """
        Get composio tools wrapped as Lyzr `Function` objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags

        :return: Composio tools wrapped as `Function` objects
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
            )
        ]
