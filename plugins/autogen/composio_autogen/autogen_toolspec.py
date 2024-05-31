import hashlib
import logging
import os
import types
from inspect import Signature
from typing import Dict, List, Optional, Union

import autogen
from autogen.agentchat.conversable_agent import ConversableAgent

from composio import Action, App, ComposioCore, FrameworkEnum, Tag
from composio.sdk.exceptions import UserNotAuthenticatedException
from composio.sdk.shared_utils import get_signature_format_from_schema_params


logger = logging.getLogger(__name__)

client = ComposioCore(
    framework=FrameworkEnum.AUTOGEN, api_key=os.environ.get("COMPOSIO_API_KEY", None)
)


class ComposioToolset:
    def __init__(
        self,
        client: ComposioCore = client,
        caller=None,
        executor=None,
        entity_id: str = "default",
        connection_ids: Optional[Dict[Union[str, App], str]] = None,
    ):
        """
        Initialize the ComposioToolset.

        Args:
            client (ComposioCore, optional): The ComposioCore client. Defaults to the global client.
            caller (ConversableAgent, optional): The caller for the tools. Defaults to None.
            executor (ConversableAgent, optional): The executor for the tools. Defaults to None.
            entity_id (str, optional): The ID of the entity for which to execute the action. Defaults to "default".
            connection_ids (Dict[Union[str, App], str], optional): A dictionary of connection IDs to filter the tools by. If None, all connection IDs are retrieved.
        """
        self.client = client
        self.caller = caller
        self.executor = executor
        self.entity_id = entity_id
        self.connection_ids = connection_ids or {}

    def register_tools(
        self,
        tools: Union[App, List[App]],
        caller: ConversableAgent = None,
        executor: ConversableAgent = None,
        tags: List[Union[str, Tag]] = None,
    ):
        """
        Register a list of tools to the Autogen agent.

        Args:
            tools (Union[App, List[App]]): A list of App enum instances to filter the tools by. If None, all tools are retrieved.
            caller (ConversableAgent, optional): The caller for the tools. Defaults to None.
            executor (ConversableAgent, optional): The executor for the tools. Defaults to None.
            tags (List[Union[str, Tag]], optional): A list of tags to filter the tools by. If None, all tags are retrieved.
        """
        if isinstance(tools, App):
            tools = [tools]
        assert (
            caller or self.caller
        ), "If caller hasn't been specified during initialization, has to be specified during registration"
        assert (
            executor or self.executor
        ), "If executor hasn't been specified during initialization, has to be specified during registration"

        if self.client.is_authenticated() is False:
            raise UserNotAuthenticatedException(
                "User not authenticated. Please authenticate using composio-cli login"
            )

        action_schemas = self.client.sdk.get_list_of_actions(apps=tools, tags=tags)

        for schema in action_schemas:
            self._register_schema_to_autogen(
                action_schema=schema,
                caller=caller if caller else self.caller,
                executor=executor if executor else self.executor,
            )

    def register_actions(
        self,
        actions: Union[Action, List[Action]],
        caller: ConversableAgent = None,
        executor: ConversableAgent = None,
    ):
        """
        Register a list of actions to the Autogen agent.

        Args:
            actions (Union[Action, List[Action]]): A list of Action enum instances to filter the actions by. If None, all actions are retrieved.
            caller (ConversableAgent, optional): The caller for the tools. Defaults to None.
            executor (ConversableAgent, optional): The executor for the tools. Defaults to None.
        """
        if isinstance(actions, Action):
            actions = [actions]

        assert (
            caller or self.caller
        ), "If caller hasn't been specified during initialization, has to be specified during registration"
        assert (
            executor or self.executor
        ), "If executor hasn't been specified during initialization, has to be specified during registration"

        action_schemas = self.client.sdk.get_list_of_actions(actions=actions)

        for schema in action_schemas:
            self._register_schema_to_autogen(
                action_schema=schema,
                caller=caller if caller else self.caller,
                executor=executor if executor else self.executor,
            )

    def process_function_name_for_registration(
        self, input_string, max_allowed_length=64, num_hash_char=10
    ):
        """
        Process the function name for registration.

        Args:
            input_string (str): The input string to process.
            max_allowed_length (int, optional): The maximum allowed length of the function name. Defaults to 64.
            num_hash_char (int, optional): The number of hash characters to attach to the function name. Defaults to 10.

        Returns:
            str: The processed function name.
        """
        hash_obj = hashlib.sha256(input_string.encode())
        hash_hex = hash_obj.hexdigest()

        num_input_str_char = max_allowed_length - (num_hash_char + 1)
        hash_chars_to_attach = hash_hex[:10]
        input_str_to_attach = input_string[-num_input_str_char:]
        processed_name = input_str_to_attach + "_" + hash_chars_to_attach

        return processed_name

    def _register_schema_to_autogen(
        self, action_schema, caller: ConversableAgent, executor: ConversableAgent
    ):
        """
        Register a tool to the Autogen agent.

        Args:
            action_schema (dict[str, any]): The action schema.
            caller (ConversableAgent): The caller for the tools.
            executor (ConversableAgent): The executor for the tools.
        """
        name = action_schema["name"]
        processed_name = self.process_function_name_for_registration(name)
        appName = action_schema["appName"]
        description = action_schema["description"]

        parameters = get_signature_format_from_schema_params(
            action_schema["parameters"]
        )
        action_signature = Signature(parameters=parameters)

        def placeholder_function(**kwargs):
            return self.client.execute_action(
                self.client.get_action_enum(name, appName),
                kwargs,
                entity_id=self.entity_id,
            )

        action_func = types.FunctionType(
            placeholder_function.__code__,
            globals=globals(),
            name=processed_name,
            closure=placeholder_function.__closure__,
        )
        action_func.__signature__ = action_signature
        action_func.__doc__ = (
            description if description else f"Action {name} from {appName}"
        )

        autogen.agentchat.register_function(
            action_func,
            caller=caller,
            executor=executor,
            name=processed_name,
            description=description if description else f"Action {name} from {appName}",
        )
