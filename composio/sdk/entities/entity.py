from typing import TYPE_CHECKING, Any, Union, Optional
from datetime import datetime
from openai.types.chat.chat_completion import ChatCompletion
from composio.sdk.entities.connectedAccount import ConnectedAccount
import json
from composio.sdk.entities.integration import Integration

from composio.sdk.exceptions import InvalidParameterException, NotFoundException
from openai.types.beta.threads.run import Run as OpenAIRun
from openai.types.beta.thread import Thread as OpenAIThread
from openai import Client
from time import time

if TYPE_CHECKING:
    from composio import Composio
    from composio.sdk.enums import Tag, App, Action

class Entity:
    def __init__(self, sdk_instance: 'Composio', entity_id: str) -> None:
        """Initializes an Entity object.

        :param sdk_instance: The Composio SDK instance.
        :type sdk_instance: Composio
        :param entity_id: The ID of the entity.
        :type entity_id: str
        """
        self.sdk_instance = sdk_instance
        entity_id = entity_id if isinstance(entity_id, str) else ",".join(entity_id)
        self.entity_id = entity_id

    # TODO
    def get_all_actions(self, tags: Optional[list['Tag']] = None) -> list['Action']:
        """"""
        actions = []
        connected_accounts = self.sdk_instance.list_connected_accounts(
            entity_id=self.entity_id
        )

        for account in connected_accounts:
            # @TODO: Add support for tags
            account_actions = account.get_all_actions()
            actions.extend(account_actions)
        return actions

    def get_connection(self, app_name: 'App') -> Optional[ConnectedAccount]:
        connected_accounts = self.sdk_instance.list_connected_accounts(
            entity_id=self.entity_id, showActiveOnly=True
        )
        """
            Gets the connection associated with the specified app.

            :param App app_name: The app to get the connection for.
            :type app_name: App

            :return: The ConnectedAccount object representing the connection.
            :rtype: Optional[ConnectedAccount]
        """
        latest_account = None
        latest_creation_date = None
        for account in connected_accounts:
            if app_name == account.appUniqueId:
                creation_date = datetime.fromisoformat(
                    account.createdAt.replace("Z", "+00:00")
                )
                if latest_creation_date is None:
                    latest_creation_date = creation_date
                if latest_account is None or creation_date > latest_creation_date:
                    latest_account = account
                    latest_creation_date = creation_date

        if latest_account:
            return latest_account

        return None

    def is_app_authenticated(self, app_name: 'App') -> bool:
        """ Checks if the app is authenticated for the entity.

        :param App app_name: The app to check for authentication.
        :type app_name: App

        :return: True if the app is authenticated, False otherwise.
        :rtype: bool
        """
        connected_account = self.get_connection(app_name)
        return connected_account is not None

    def initiate_oauth_connection(
        self,
        integration: Integration,
        app: 'App',
        redirect_url: Optional[str] = None,
    ):
        """Initiates a OAUTH connection with an integration.

        :param Integration integration: The integration to connect with.
        :param App app: The app to connect with.
        :param Optional[str] redirect_url: The redirect URL to use. Defaults to None.

        :return: The OAuthConnectionRequest object representing the connection request.
        :rtype: OAuthConnectionRequest
        """
        if not integration and not app:
            raise InvalidParameterException("Either 'integration' or 'app' must be provided")
        if not integration:
            integration = self.sdk_instance.create_integration(
                app=app,
                name=f"test_integration_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                auth_mode="OAUTH2",
                use_default_credentials=True
            )
        return integration.initiate_connection(
            entity_id=self.entity_id, redirect_url=redirect_url
        )

    def initiate_connection_not_oauth(
        self,
        app_name: 'App',
        auth_mode: str,
        redirect_url: Optional[str] = None
    ):
        """ Initiates a connection with an integration.

        :param App app_name: The app to connect with.
        :param str auth_mode: The authentication mode to use.
        :param Optional[str] redirect_url: The redirect URL to use. Defaults to None.

        :return: The OAuthConnectionRequest object representing the connection request.
        :rtype: OAuthConnectionRequest
        """
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        integration = self.sdk_instance.create_integration(
            app_name, name=f"integration_{timestamp}", auth_mode=auth_mode
        )
        return integration.initiate_connection(
            entity_id=self.entity_id, redirect_url=redirect_url
        )
