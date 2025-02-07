import types
import typing as t
from inspect import Signature

from composio import ActionType, AppType, TagType
from composio.client.collections import ActionModel
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.utils.shared import get_signature_format_from_schema_params


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="google_gemini",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for Google AI Python Gemini framework.

    Example:
    ```python
        from google import genai
        from google.genai import types

        from composio_gemini import Action, ComposioToolSet


        # Create composio client
        toolset = ComposioToolSet()

        # Create google client
        client = genai.Client()

        # Create genai client config
        config = types.GenerateContentConfig(
            tools=toolset.get_tools(  # type: ignore
                actions=[
                    Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER,
                ]
            )
        )
        # Use the chat interface.
        chat = client.chats.create(model="gemini-2.0-flash", config=config)
        response = chat.send_message(
            "Can you star composiohq/composio repository on github",
        )
        print(response.text)
    ```
    """

    def _wrap_tool(
        self,
        schema: ActionModel,
        entity_id: t.Optional[str] = None,
    ) -> t.Callable:
        """Wraps composio tool as Google Genai SDK compatible function calling object."""

        docstring = schema.description
        docstring += "\nArgs:"
        for _param, _schema in schema.parameters.properties.items():
            docstring += "\n    "
            docstring += _param + ": " + _schema.get("description", _param.title())

        docstring += "\nReturns:"
        docstring += "\n    A dictionary containing response from the action"

        def _execute(**kwargs: t.Any) -> t.Dict:
            return self.execute_action(
                action=schema.name,
                params=kwargs,
                entity_id=entity_id,
            )

        function = types.FunctionType(
            code=_execute.__code__,
            name=schema.name,
            globals=globals(),
            closure=_execute.__closure__,
        )
        parameters = get_signature_format_from_schema_params(
            schema_params=schema.parameters.model_dump(),
        )
        setattr(function, "__signature__", Signature(parameters=parameters))
        setattr(
            function,
            "__annotations__",
            {p.name: p.annotation for p in parameters} | {"return": dict},
        )
        function.__doc__ = docstring
        return function

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.List[t.Callable]:
        """
        Get composio tools wrapped as Google Genai SDK compatible function calling object.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as python callable
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        return [
            self._wrap_tool(schema=tool, entity_id=entity_id)
            for tool in self.get_action_schemas(
                actions=actions,
                apps=apps,
                tags=tags,
                _populate_requested=True,
            )
        ]
