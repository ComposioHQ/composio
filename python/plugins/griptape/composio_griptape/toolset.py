import logging
import typing as t

import typing_extensions as te
from griptape.tools import BaseTool
from griptape.utils.decorators import activity
from schema import Literal, Schema

from composio import Action, ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.utils.shared import PYDANTIC_TYPE_TO_PYTHON_TYPE


logger = logging.getLogger(__name__)


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="griptape",
    description_char_limit=1024,
):
    """
    Composio toolset wrapper for Griptape framework.

    Example:
    ```python
        import dotenv

        from composio_griptape import App, ComposioToolSet
        from griptape.structures import Agent
        from griptape.utils import Chat

        # Load environment variables from .env
        dotenv.load_dotenv()

        # Initialize Toolset
        composio_toolset = ComposioToolSet()

        #
        github_tools = composio_toolset.get_tools(apps=[App.GITHUB])

        # Initialize agent.
        agent = Agent(tools=github_tools)

        # Start the agent.
        Chat(agent).start()
    ```
    """

    def _wrap_tool(
        self,
        schema: t.Dict,
        entity_id: t.Optional[str] = None,
    ) -> BaseTool:
        """Wrap Composio tool as GripTape `BaseTool` object"""
        name = schema["name"]
        description = schema["description"]

        schema_dict = {}
        for param_name, param_body in schema["parameters"]["properties"].items():
            dtype = param_body["type"]
            description = param_body["description"]
            schema_key = Literal(param_name, description=description)
            if dtype in PYDANTIC_TYPE_TO_PYTHON_TYPE:
                schema_dtype = PYDANTIC_TYPE_TO_PYTHON_TYPE.get(dtype)
            elif dtype == "array":
                schema_array_dtype = PYDANTIC_TYPE_TO_PYTHON_TYPE.get(
                    param_body["items"].get("type"),
                    None,
                )
                schema_dtype = list[schema_array_dtype] if schema_array_dtype else list  # type: ignore
            else:
                raise TypeError(
                    f"Some dtype of current schema are not handled yet. Current Schema: {param_body}"
                )

            schema_dict[schema_key] = schema_dtype

        def _execute_task(params: t.Dict) -> t.Dict:
            """Placeholder method for executing task."""
            return self.execute_action(
                action=Action(value=name),
                params=params,
                entity_id=entity_id or self.entity_id,
            )

        class GripTapeTool(BaseTool):
            """
            Griptap tool wrapper for Composio tools.
            """

            @activity(
                config={
                    "description": description,
                    "schema": Schema(schema=schema_dict),
                }
            )
            def execute_task(self, params: t.Dict) -> t.Dict:
                """Executed task."""
                return _execute_task(params=params["values"])

            @property
            def manifest(self) -> t.Dict:
                """Tool menifest."""
                return {
                    "version": "v1",
                    "name": name,
                    "description": description,
                    "contact_email": "hello@composio.dev",
                    "legal_info_url": "https://www.composio.dev/legal",
                }

        name = "".join(map(lambda x: x.title(), name.split("_"))) + "Client"
        cls = type(name, (GripTapeTool,), {})
        return cls()

    @te.deprecated("Use `ComposioToolSet.get_tools` instead")
    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.List[BaseTool]:
        """
        Get composio tools wrapped as GripTape `BaseTool` type objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID to use for executing function calls.
        :return: Composio tools wrapped as `BaseTool` objects
        """
        return self.get_tools(actions=actions, entity_id=entity_id)

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.List[BaseTool]:
        """
        Get composio tools wrapped as GripTape `BaseTool` type objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `BaseTool` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        return [
            self._wrap_tool(
                schema=tool.model_dump(
                    exclude_none=True,
                ),
                entity_id=entity_id,
            )
            for tool in self.get_action_schemas(actions=actions, apps=apps, tags=tags)
        ]
