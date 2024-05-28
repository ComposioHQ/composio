"""
Composio SDK tools.
"""

import os
import typing as t
from pathlib import Path

from composio.client import Composio
from composio.client.enums import Action
from composio.constants import (
    DEFAULT_ENTITY_ID,
    ENV_COMPOSIO_API_KEY,
    LOCAL_CACHE_DIRECTORY_NAME,
    USER_DATA_FILE_NAME,
)
from composio.exceptions import raise_api_key_missing
from composio.storage.user import UserData


class ComposioToolSet:
    """Composio toolset."""

    client: Composio

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        runtime: t.Optional[str] = None,
        entity_id: str = DEFAULT_ENTITY_ID,
    ) -> None:
        """
        Initialize composio toolset

        :param api_key: Composio API key
        :param base_url: Base URL for the Composio API server
        :param runtime: Name of the framework runtime, eg. openai, crewai...
        """
        # Check check constructor aegument, environment variables and user data for the key
        self.api_key = (
            api_key
            or os.environ.get(ENV_COMPOSIO_API_KEY)
            or UserData.load(
                Path.home() / LOCAL_CACHE_DIRECTORY_NAME / USER_DATA_FILE_NAME
            ).api_key
        )
        if self.api_key is None:
            raise_api_key_missing()
        self.client = Composio(
            api_key=self.api_key,
            base_url=base_url,
        )
        self.runtime = runtime
        self.entity_id = entity_id

    def execute_action(
        self,
        action: t.Union[Action, str],
        params: dict,
        entity_id: str = "default",
    ) -> t.Dict:
        """
        Execute an action on a given entity.

        :param action: Action to execute.
        :param params: The parameters to pass to the action.
        :param entity_id: The ID of the entity to execute the action on. Defaults to "default".
            Any: The output of the action execution.
        :return: Output object from the function call.
        """
        if isinstance(action, str):
            action = Action(action)
        return self.client.get_entity(entity_id).execute(action=action, params=params)
