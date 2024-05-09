
from typing import Union, Optional
from composio import Composio, Tag, App, Action
from composiol.sdk.models.connectedAccoun

class Entity:
    def __init__(self, composio: Composio, entity_id: str) -> None:
        self.client = composio
        entity_id = entity_id if isinstance(entity_id, str) else ",".join(entity_id)
        self.entity_id = entity_id

    def get_all_actions(self, tags: Optional[list[Union[str, Tag]]] = None) -> list[Action]:
        actions = []
        connected_accounts = self.client.get_connected_accounts(
            entity_id=self.entity_id
        )

        for account in connected_accounts:
            account_actions = account.get_all_actions(tags=tags)
            actions.extend(account_actions)
        return actions

    def get_connection(self, app_name: Union[str, App]) -> Optional[ConnectedAccount]:
        if isinstance(app_name, App):
            app_name = app_name.value
        connected_accounts = self.client.get_connected_accounts(
            entity_id=self.entity_id, showActiveOnly=True
        )
        latest_account = None
        latest_creation_date = None
        for account in connected_accounts:
            if app_name == account.appUniqueId:
                creation_date = datetime.fromisoformat(
                    account.createdAt.replace("Z", "+00:00")
                )
                if latest_account is None or creation_date > latest_creation_date:
                    latest_account = account
                    latest_creation_date = creation_date
        if latest_account:
            return latest_account

        return None

    def is_app_authenticated(self, app_name: Union[str, App]) -> bool:
        connected_account = self.get_connection(app_name)
        return connected_account is not None

    def handle_tools_calls(  # pylint: disable=unused-argument
        self, tool_calls: ChatCompletion, verbose: bool = False
    ) -> list[any]:
        output = []
        try:
            if tool_calls.choices:
                for choice in tool_calls.choices:
                    if choice.message.tool_calls:
                        for tool_call in choice.message.tool_calls:
                            action_name_to_execute = tool_call.function.name
                            action = self.client.get_action_enum_without_tool(
                                action_name=action_name_to_execute
                            )
                            arguments = json.loads(tool_call.function.arguments)
                            account = self.get_connection(app_name=action.service)
                            output.append(account.execute_action(action, arguments))

        except Exception as e:
            raise e from e

        return output

    def handle_run_tool_calls(self, run_object: run, verbose: bool = False):
        outputs = []
        require_action = run_object.required_action.submit_tool_outputs
        try:
            for tool_call in require_action.tool_calls:
                if tool_call.type == "function":
                    action_name_to_execute = tool_call.function.name
                    action = self.client.get_action_enum_without_tool(
                        action_name=action_name_to_execute
                    )
                    arguments = json.loads(tool_call.function.arguments)
                    account = self.get_connection(app_name=action.service)
                    if verbose:
                        print("Executing Function: ", action)
                        print("Arguments: ", arguments)
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
        run: run,
        thread: thread,
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
        integration: Integration = None,
        app_name: Union[str, App] = None,
        redirect_url: str = None,
    ):
        if not integration and not app_name:
            raise InvalidParameterException("Either 'integration' or 'app_name' must be provided")
        if not integration:
            integration = self.client.get_default_integration(app_name)
        return integration.initiate_connection(
            entity_id=self.entity_id, redirect_url=redirect_url
        )

    def initiate_connection_not_oauth(
        self, app_name: Union[str, App], redirect_url: str = None, auth_mode: str = None
    ):
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        integration = self.client.create_integration(
            app_name, name=f"integration_{timestamp}", auth_mode=auth_mode
        )
        return integration.initiate_connection(
            entity_id=self.entity_id, redirect_url=redirect_url
        )
