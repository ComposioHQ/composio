"""
Google AI Python Gemini tool spec.
"""

import typing as t

import typing_extensions as te
from vertexai.generative_models import (
    Tool,
    FunctionDeclaration,
)

from composio import Action, ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.utils.shared import json_schema_to_model


class ComposioToolset(
    BaseComposioToolSet,
    runtime="google_ai",
    description_char_limit=1024,
):
    """
    Composio toolset for Google AI Python Gemini framework.

    Example:
    ```python
        import os
        import dotenv
        from vertexai.generative_models import GenerativeModel
        from composio_google import ComposioToolSet, App

        # Load environment variables from .env
        dotenv.load_dotenv()

        # Initialize tools
        composio_toolset = ComposioToolSet()

        # Get GitHub tools that are pre-configured
        tools = composio_toolset.get_tools(apps=[App.GITHUB])

        # Initialize the Gemini model
        model = GenerativeModel("gemini-pro", tools=tools)

        # Start a chat
        chat = model.start_chat()

        # Define task
        task = "Star a repo composiohq/composio on GitHub"

        # Send a message to the model
        response = chat.send_message(task)

        print(response.text)

        # Handle function calls if any
        if response.candidates[0].content.parts[-1].function_call:
            function_call = response.candidates[0].content.parts[-1].function_call
            result = composio_toolset.execute_function_call(function_call)
            print(result)
    ```
    """

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ) -> FunctionDeclaration:
        """Wraps composio tool as Google AI Python Gemini FunctionDeclaration object."""
        action = schema["name"]
        description = schema.get("description", schema["name"])
        parameters = json_schema_to_model(schema["parameters"])

        return FunctionDeclaration(
            name=action,
            description=description,
            parameters=parameters.schema(),
        )

    @te.deprecated("Use `ComposioToolSet.get_tools` instead")
    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.List[FunctionDeclaration]:
        """
        Get composio tools wrapped as Google AI Python Gemini FunctionDeclaration objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `FunctionDeclaration` objects
        """
        return self.get_tools(actions=actions, entity_id=entity_id)

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.List[FunctionDeclaration]:
        """
        Get composio tools wrapped as Google AI Python Gemini FunctionDeclaration objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `FunctionDeclaration` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        return [
            self._wrap_tool(
                schema=tool.model_dump(
                    exclude_none=True,
                ),
                entity_id=entity_id or self.entity_id,
            )
            for tool in self.get_action_schemas(actions=actions, apps=apps, tags=tags)
        ]

    def execute_function_call(
        self,
        function_call: t.Any,
        entity_id: t.Optional[str] = None,
    ) -> t.Dict:
        """
        Execute a function call.

        :param function_call: Function call metadata from Gemini model response.
        :param entity_id: Entity ID to use for executing the function call.
        :return: Object containing output data from the function call.
        """
        return self.execute_action(
            action=Action(value=function_call.name),
            params=function_call.args,
            entity_id=entity_id or self.entity_id,
        )

    def create_tool(self, functions: t.List[FunctionDeclaration]) -> Tool:
        """
        Create a Tool object from a list of FunctionDeclarations.

        :param functions: List of FunctionDeclaration objects.
        :return: Tool object containing the function declarations.
        """
        return Tool(function_declarations=functions)
