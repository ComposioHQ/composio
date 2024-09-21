import hashlib
import types
import typing as t
from inspect import Signature

import autogen
import typing_extensions as te
from autogen.agentchat.conversable_agent import ConversableAgent

from composio import Action, ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.utils.shared import get_signature_format_from_schema_params


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="autogen",
    description_char_limit=1024,
):
    """
    Composio toolset for autogen framework.
    """

    def register_tools(
        self,
        caller: ConversableAgent,
        executor: ConversableAgent,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
    ) -> None:
        """
        Register tools to the proxy agents.

        :param executor: Executor agent.
        :param caller: Caller agent.
        :param apps: List of apps to wrap
        :param actions: List of actions to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper
        :param entity_id: Entity ID to use for executing function calls.
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        schemas = self.get_action_schemas(actions=actions, apps=apps, tags=tags)
        for schema in schemas:
            self._register_schema_to_autogen(
                schema=schema.model_dump(
                    exclude_defaults=True,
                    exclude_none=True,
                    exclude_unset=True,
                ),
                caller=caller,
                executor=executor,
                entity_id=entity_id or self.entity_id,
            )

    @te.deprecated("Use `ComposioToolSet.register_tools` instead")
    def register_actions(
        self,
        caller: ConversableAgent,
        executor: ConversableAgent,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ):
        """
        Register tools to the proxy agents.

        :param actions: List of tools to register.
        :param caller: Caller agent.
        :param executor: Executor agent.
        :param entity_id: Entity ID to use for executing function calls.
        """
        self.register_tools(
            caller=caller,
            executor=executor,
            actions=actions,
            entity_id=entity_id,
        )

    def _process_function_name_for_registration(
        self,
        input_string: str,
        max_allowed_length: int = 64,
        num_hash_char: int = 10,
    ):
        """
        Process function name for proxy registration under given character length limitation.
        """
        hash_hex = hashlib.sha256(input_string.encode(encoding="utf-8")).hexdigest()
        hash_chars_to_attach = hash_hex[:10]
        num_input_str_char = max_allowed_length - (num_hash_char + 1)
        input_str_to_attach = input_string[-num_input_str_char:]
        processed_name = input_str_to_attach + "_" + hash_chars_to_attach
        return processed_name

    def _register_schema_to_autogen(
        self,
        schema: t.Dict,
        caller: ConversableAgent,
        executor: ConversableAgent,
        entity_id: t.Optional[str] = None,
    ) -> None:
        """
        Register a schema to the Autogen registry.

        Args:
            schema (dict[str, any]): The action schema to be registered.
            caller (ConversableAgent): The agent responsible for initiating the tool registration.
            executor (ConversableAgent): The agent responsible for executing the registered tools.
            entity_id (str, optional): The identifier of the entity for which the action is executed. Defaults to None.
        """
        name = schema["name"]
        appName = schema["appName"]
        description = schema["description"]

        def execute_action(**kwargs: t.Any) -> t.Dict:
            """Placeholder function for executing action."""
            return self.execute_action(
                action=Action(value=name),
                params=kwargs,
                entity_id=entity_id or self.entity_id,
            )

        function = types.FunctionType(
            code=execute_action.__code__,
            globals=globals(),
            name=self._process_function_name_for_registration(
                input_string=name,
            ),
            closure=execute_action.__closure__,
        )
        function.__signature__ = Signature(  # type: ignore
            parameters=get_signature_format_from_schema_params(
                schema_params=schema["parameters"],
            ),
        )
        function.__doc__ = (
            description if description else f"Action {name} from {appName}"
        )
        autogen.agentchat.register_function(
            function,
            caller=caller,
            executor=executor,
            name=self._process_function_name_for_registration(
                input_string=name,
            ),
            description=description if description else f"Action {name} from {appName}",
        )
