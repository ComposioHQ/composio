
from typing import Any, Union, Optional
from composio import Composio, Tag, App, Action
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

class Entity:
    def __init__(self, sdk_instance: Composio, entity_id: str) -> None:
        self.sdk_instance = sdk_instance
        entity_id = entity_id if isinstance(entity_id, str) else ",".join(entity_id)
        self.entity_id = entity_id

    def get_all_actions(self, tags: Optional[list[Tag]] = None) -> list[Action]:
        actions = []
        connected_accounts = self.sdk_instance.list_connected_accounts(
            entity_id=self.entity_id
        )

        for account in connected_accounts:
            # @TODO: Add support for tags
            account_actions = account.get_all_actions()
            actions.extend(account_actions)
        return actions

    def get_connection(self, app_name: Union[str, App]) -> Optional[ConnectedAccount]:
        if isinstance(app_name, App):
            app_name = app_name.value
        connected_accounts = self.sdk_instance.list_connected_accounts(
            entity_id=self.entity_id, showActiveOnly=True
        )
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

    def is_app_authenticated(self, app_name: Union[str, App]) -> bool:
        connected_account = self.get_connection(app_name)
        return connected_account is not None

    def handle_tools_calls(
        self,
        tool_calls: ChatCompletion
    ) -> list[Any]:
        output = []
        try:
            if tool_calls.choices:
                for choice in tool_calls.choices:
                    if choice.message.tool_calls:
                        for tool_call in choice.message.tool_calls:
                            action_name_to_execute = tool_call.function.name
                            action = self.sdk_instance.get_action_enum_without_tool(
                                action_name=action_name_to_execute
                            )
                            if action is None:
                                raise NotFoundException(f"Action {action_name_to_execute} not found.")
                            arguments = json.loads(tool_call.function.arguments)
                            account = self.get_connection(app_name=action.service)
                            if account is None:
                                raise NotFoundException("No connected account found for the specified action.")
                            output.append(account.execute_action(action, arguments))

        except Exception as e:
            raise e from e

        return output

    def handle_run_tool_calls(self, run_object: OpenAIRun, verbose: bool = False):
        outputs = []
        if run_object.required_action is None:
            raise NotFoundException("No required action found for the run on the OpenAI Run object.")
        require_action = run_object.required_action.submit_tool_outputs
        try:
            for tool_call in require_action.tool_calls:
                if tool_call.type == "function":
                    action_name_to_execute = tool_call.function.name
                    action = self.sdk_instance.get_action_enum_without_tool(
                        action_name=action_name_to_execute
                    )
                    arguments = json.loads(tool_call.function.arguments)
                    account = self.get_connection(app_name=action.service)
                    if verbose:
                        print("Executing Function: ", action)
                        print("Arguments: ", arguments)
                    if account is None:
                        raise NotFoundException(f"No connected account found for the specified action - {action_name_to_execute}.")
                    response = account.execute_action(action, arguments)
                    if verbose:
                        print("Output", response)
                    output = {
                        "tool_call_id": tool_call.id,
                        "output": json.dumps(response.get("response_data", {})),
                    }
                    outputs.append(output)
        except Exception as e:
            raise e from e

        return outputs

    def wait_and_handle_tool_calls(
        self,
        client: Client,
        run: OpenAIRun,
        thread: OpenAIThread,
        verbose: bool = False,
    ):
        run_object = run
        thread_object = thread
        while run_object.status in ("queued", "in_progress", "requires_action"):
            # Look here
            if run_object.status == "requires_action":
                run_object = client.beta.threads.runs.submit_tool_outputs(
                    thread_id=thread_object.id,
                    run_id=run_object.id,
                    tool_outputs=self.handle_run_tool_calls(
                        run_object, verbose=verbose
                    ),  # all tool calls executed
                )
            else:
                run_object = client.beta.threads.runs.retrieve(
                    thread_id=thread_object.id,
                    run_id=run_object.id,
                )
                time.sleep(0.5)
        return run_object

    def initiate_connection(
        self,
        integration: Integration,
        app: App,
        redirect_url: Optional[str] = None,
    ):
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
        app_name: App,
        auth_mode: str,
        redirect_url: Optional[str] = None
    ):
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        integration = self.sdk_instance.create_integration(
            app_name, name=f"integration_{timestamp}", auth_mode=auth_mode
        )
        return integration.initiate_connection(
            entity_id=self.entity_id, redirect_url=redirect_url
        )
