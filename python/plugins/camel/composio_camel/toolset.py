"""
Camel tool spec.
"""

import typing as t

import typing_extensions as te

# pylint: disable=E0611
from camel.toolkits import OpenAIFunction

from composio import Action, ActionType, AppType, TagType
from composio.constants import DEFAULT_ENTITY_ID
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.schema import OpenAISchema, SchemaType
from composio.tools.toolset import ProcessorsType


# pylint: enable=E0611


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="camel",
    description_char_limit=1024,
):
    """
    Composio toolset for OpenAI framework.

    Example:
    ```python
        from colorama import Fore

        from camel.agents import ChatAgent
        from camel.configs import ChatGPTConfig
        from camel.messages import BaseMessage
        from camel.models import ModelFactory
        from camel.types import ModelPlatformType, ModelType
        from camel.utils import print_text_animated
        from composio_camel import ComposioToolSet, Action

        composio_toolset = ComposioToolSet()
        tools = composio_toolset.get_actions(
            actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
        )

        # set up LLM model
        assistant_model_config = ChatGPTConfig(
            temperature=0.0,
            tools=tools,
        )

        model = ModelFactory.create(
            model_platform=ModelPlatformType.OPENAI,
            model_type=ModelType.GPT_3_5_TURBO,
            model_config_dict=assistant_model_config.__dict__,
        )


        # set up agent
        assistant_sys_msg = BaseMessage.make_assistant_message(
            role_name="Developer",
            content=(
                "You are a programmer as well an experienced github user. "
                "When asked given a instruction, "
                "you try to use available tools, and execute it"
            ),
        )

        agent = ChatAgent(
            assistant_sys_msg,
            model,
            tools=tools,
        )
        agent.reset()


        # set up agent

        prompt = (
            "I have created a new Github Repo,"
            "Please star my github repository: camel-ai/camel"
        )
        user_msg = BaseMessage.make_user_message(role_name="User", content=prompt)
        print(Fore.YELLOW + f"user prompt:\n{prompt}\n")

        response = agent.step(user_msg)
        for msg in response.msgs:
            print_text_animated(Fore.GREEN + f"Agent response:\n{msg.content}\n")
    ```
    """

    schema = SchemaType.OPENAI

    def validate_entity_id(self, entity_id: str) -> str:
        """Validate entity ID."""
        if (
            self.entity_id != DEFAULT_ENTITY_ID
            and entity_id != DEFAULT_ENTITY_ID
            and self.entity_id != entity_id
        ):
            raise ValueError(
                "Separate `entity_id` can not be provided during "
                "initialization and handling tool calls"
            )
        if self.entity_id != DEFAULT_ENTITY_ID:
            entity_id = self.entity_id
        return entity_id

    def _wrap_tool(
        self,
        schema: t.Dict,
        entity_id: t.Optional[str] = None,
    ) -> OpenAIFunction:
        """
        Wrap composio tool as Camel `OpenAIFunction` object.
        """
        name = schema["function"]["name"]

        def function(**kwargs: t.Any) -> t.Dict:
            """Composio tool wrapped as camel's OpenAIFunction."""
            return self.execute_action(
                action=Action(value=name),
                params=kwargs,
                entity_id=entity_id or self.entity_id,
            )

        return OpenAIFunction(
            func=function,
            openai_tool_schema=schema,
        )

    @te.deprecated("Use `ComposioToolSet.get_tools` instead")
    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.List[OpenAIFunction]:
        """
        Get composio tools wrapped as Camel `OpenAIFunction` objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `OpenAIFunction` objects
        """
        return self.get_tools(actions=actions, entity_id=entity_id)

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> t.List[OpenAIFunction]:
        """
        Get composio tools wrapped as Camel `OpenAIFunction` objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `OpenAIFunction` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._merge_processors(processors)
        return [
            self._wrap_tool(  # type: ignore
                t.cast(
                    OpenAISchema,
                    self.schema.format(
                        schema.model_dump(
                            exclude_none=True,
                        ),
                    ),
                ).model_dump(),
                entity_id=entity_id,
            )
            for schema in self.get_action_schemas(
                actions=actions,
                apps=apps,
                tags=tags,
                check_connected_accounts=check_connected_accounts,
            )
        ]
