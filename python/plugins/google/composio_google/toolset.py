"""
Google AI Python Gemini tool spec.
"""

import typing as t
import warnings

import typing_extensions as te
from proto.marshal.collections.maps import MapComposite
from vertexai.generative_models import (
    Content,
    FunctionDeclaration,
    GenerationResponse,
    Part,
    Tool,
)

from composio import Action, ActionType, AppType, TagType
from composio.constants import DEFAULT_ENTITY_ID
from composio.exceptions import InvalidEntityIdError
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.utils import help_msg
from composio.utils.shared import json_schema_to_model


class ComposioToolset(
    BaseComposioToolSet,
    runtime="google_ai",
    description_char_limit=1024,
    action_name_char_limit=64,
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
        result = composio_toolset.handle_response(response)
        if result:
            print(result)
    ```
    """

    def validate_entity_id(self, entity_id: str) -> str:
        """Validate entity ID."""
        if (
            self.entity_id != DEFAULT_ENTITY_ID
            and entity_id != DEFAULT_ENTITY_ID
            and self.entity_id != entity_id
        ):
            raise InvalidEntityIdError(
                "separate `entity_id` can not be provided during "
                "initialization and handling tool calls"
            )
        if self.entity_id != DEFAULT_ENTITY_ID:
            entity_id = self.entity_id
        return entity_id

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
    ) -> FunctionDeclaration:
        """Wraps composio tool as Google AI Python Gemini FunctionDeclaration object."""
        action = schema["name"]
        description = schema.get("description", action)
        parameters = json_schema_to_model(schema["parameters"])

        # Clean up properties by removing 'examples' field
        properties = parameters.schema().get("properties", {})
        cleaned_properties = {
            prop_name: {k: v for k, v in prop_schema.items() if k != "examples"}
            for prop_name, prop_schema in properties.items()
        }

        # Create cleaned parameters
        cleaned_parameters = {
            "type": "object",
            "properties": cleaned_properties,
            "required": parameters.schema().get("required", []),
        }

        return FunctionDeclaration(
            name=action,
            description=description,
            parameters=cleaned_parameters,
        )

    @te.deprecated("Use `ComposioToolSet.get_tools` instead.\n", category=None)
    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> Tool:
        """
        Get composio tools wrapped as Google AI Python Gemini FunctionDeclaration objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `FunctionDeclaration` objects
        """
        warnings.warn(
            "Use `ComposioToolSet.get_tools` instead.\n" + help_msg(),
            DeprecationWarning,
            stacklevel=2,
        )
        return self.get_tool(actions=actions, entity_id=entity_id)

    def get_tool(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
    ) -> Tool:
        """
        Get composio tools wrapped as Google AI Python Gemini FunctionDeclaration objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `FunctionDeclaration` objects
        """
        entity_id = self.validate_entity_id(entity_id or self.entity_id)
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        return Tool(
            function_declarations=[
                self._wrap_tool(
                    schema=tool.model_dump(
                        exclude_none=True,
                    ),
                )
                for tool in self.get_action_schemas(
                    actions=actions,
                    apps=apps,
                    tags=tags,
                    _populate_requested=True,
                )
            ]
        )

    def execute_function_call(
        self,
        function_call: t.Any,
        entity_id: t.Optional[str] = DEFAULT_ENTITY_ID,
    ) -> t.Dict:
        """
        Execute a function call.

        :param function_call: Function call metadata from Gemini model response.
        :param entity_id: Entity ID to use for executing the function call.
        :return: Object containing output data from the function call.
        """
        entity_id = self.validate_entity_id(entity_id or self.entity_id)

        def convert_map_composite(obj):
            if isinstance(obj, MapComposite):
                return {k: convert_map_composite(v) for k, v in obj.items()}
            if isinstance(obj, (list, tuple)):
                return [convert_map_composite(item) for item in obj]
            return obj

        args = convert_map_composite(function_call.args)

        return self.execute_action(
            action=Action(value=function_call.name),
            params=args,
            entity_id=entity_id,
        )

    def handle_response(
        self,
        response: GenerationResponse,
        entity_id: t.Optional[str] = None,
    ) -> t.List[t.Dict]:
        """
        Handle response from Google AI Python Gemini model.

        :param response: Generation response from the Gemini model.
        :param entity_id: Entity ID to use for executing the function call.
        :return: A list of output objects from the function calls.
        """
        entity_id = self.validate_entity_id(entity_id or self.entity_id)
        outputs = []
        for candidate in response.candidates:
            if isinstance(candidate.content, Content) and candidate.content.parts:
                for part in candidate.content.parts:
                    if isinstance(part, Part) and part.function_call:
                        outputs.append(
                            self.execute_function_call(
                                function_call=part.function_call,
                                entity_id=entity_id,
                            )
                        )
        return outputs
