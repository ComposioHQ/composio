import hashlib
import logging
import os
import types
from inspect import Signature
from typing import List, Union

import autogen
from autogen.agentchat.conversable_agent import ConversableAgent

from composio import Action, App, ComposioCore, FrameworkEnum, Tag
from composio.sdk.exceptions import UserNotAuthenticatedException
from composio.sdk.shared_utils import get_signature_format_from_schema_params

logger = logging.getLogger(__name__)

client = ComposioCore(
    framework=FrameworkEnum.AUTOGEN, api_key=os.environ.get("COMPOSIO_API_KEY", None)
)
ComposioSDK = client.sdk


class ComposioToolset:
    def __init__(self, caller=None, executor=None, entity_id: str = "default"):
        self.caller = caller
        self.executor = executor
        self.entity_id = entity_id

    def register_tools(
        self,
        tools: Union[App, List[App]],
        caller: ConversableAgent = None,
        executor: ConversableAgent = None,
        tags: List[Union[str, Tag]] = None,
    ):
        if isinstance(tools, App):
            tools = [tools]
        assert (
            caller or self.caller
        ), "If caller hasn't been specified during initialization, has to be specified during registration"
        assert (
            executor or self.executor
        ), "If executor hasn't been specified during initialization, has to be specified during registration"

        if client.is_authenticated() is False:
            raise UserNotAuthenticatedException(
                "User not authenticated. Please authenticate using composio-cli login"
            )

        action_schemas = client.sdk.get_list_of_actions(apps=tools, tags=tags)

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
        if isinstance(actions, Action):
            actions = [actions]

        assert (
            caller or self.caller
        ), "If caller hasn't been specified during initialization, has to be specified during registration"
        assert (
            executor or self.executor
        ), "If executor hasn't been specified during initialization, has to be specified during registration"

        action_schemas = client.sdk.get_list_of_actions(actions=actions)

        for schema in action_schemas:
            self._register_schema_to_autogen(
                action_schema=schema,
                caller=caller if caller else self.caller,
                executor=executor if executor else self.executor,
            )

    def process_function_name_for_registration(
        self, input_string, max_allowed_length=64, num_hash_char=10
    ):
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
        name = action_schema["name"]
        processed_name = self.process_function_name_for_registration(name)
        appName = action_schema["appName"]
        description = action_schema["description"]

        parameters = get_signature_format_from_schema_params(
            action_schema["parameters"]
        )
        action_signature = Signature(parameters=parameters)

        def placeholder_function(**kwargs):
            return client.execute_action(
                client.get_action_enum(name, appName), kwargs, entity_id=self.entity_id
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

