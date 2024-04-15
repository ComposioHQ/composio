#!/usr/bin/env python3

import argparse
import json
import os
import sys
from beaupy.spinners import Spinner, DOTS
from rich.console import Console
from uuid import getnode as get_mac

import termcolor
from .sdk.storage import get_base_url, save_api_key
from .sdk.core import ComposioCore, UnauthorizedAccessException
from .sdk.utils import generate_enums, generate_enums_beta
from rich.table import Table

import webbrowser

from importlib.metadata import version
import requests

console = Console()

should_disable_webbrowser_open = os.getenv("DISABLE_COMPOSIO_WEBBROWSER_OPEN", "false") == "true"

def parse_arguments():
    parser = argparse.ArgumentParser(description='Composio CLI for adding integrations, managing skills, and showing apps.')
    subparsers = parser.add_subparsers(help='commands', dest='command')
    subparsers.required = True

    # Add integration command
    add_parser = subparsers.add_parser('add', help='Add an integration')
    add_parser.add_argument('integration_name', type=str, help='Name of the integration to add')
    add_parser.set_defaults(func=add_integration)

    # Login command
    login_parser = subparsers.add_parser('login', help='Login to Composio')
    login_parser.set_defaults(func=login)

    # Show active triggers command
    show_triggers_parser = subparsers.add_parser('list-active-triggers', help='List all triggers for a given app')
    show_triggers_parser.set_defaults(func=list_active_triggers)

    # Get trigger command
    get_trigger_parser = subparsers.add_parser('get-trigger', help='Get more details about a trigger')
    get_trigger_parser.add_argument('trigger_id', type=str, help='Name of the trigger to get')
    get_trigger_parser.set_defaults(func=get_trigger)

    # Who am I command
    whoami_parser = subparsers.add_parser('whoami', help='Displays your current user information')
    whoami_parser.set_defaults(func=whoami)

    # Disable trigger command 
    disable_trigger_parser = subparsers.add_parser('disable-trigger', help='Disable a trigger')
    disable_trigger_parser.add_argument('trigger_id', type=str, help='Name of the trigger to disable')
    disable_trigger_parser.set_defaults(func=disable_trigger)

    # Show apps command
    show_apps_parser = subparsers.add_parser('show-apps', help='Display available apps')
    show_apps_parser.set_defaults(func=show_apps)

    # List connections command
    list_connections_parser = subparsers.add_parser('show-connections', help='List all connections for a given app')
    list_connections_parser.add_argument('appName', type=str, help='Name of the app to list connections for')
    list_connections_parser.set_defaults(func=list_connections)

    # Correcting the structure to reflect the followup instructions
    # Set command with nested global-trigger-callback command
    set_parser = subparsers.add_parser('set', help='Set configurations')
    set_subparsers = set_parser.add_subparsers(help='set commands', dest='set_command')
    set_subparsers.required = True

    # Nested global-trigger-callback command under set
    global_trigger_callback_parser = set_subparsers.add_parser('global-trigger-callback', help='Set a global trigger callback URL')
    global_trigger_callback_parser.add_argument('callback_url', type=str, help='The URL to be called when a global trigger is activated')
    global_trigger_callback_parser.set_defaults(func=set_global_trigger_callback)

    # Enable trigger command
    enable_trigger_parser = subparsers.add_parser('enable-trigger', help='Enable a specific trigger for an app')
    enable_trigger_parser.add_argument('trigger_name', type=str, help='Name of the trigger to enable')
    enable_trigger_parser.set_defaults(func=enable_trigger)

    # List triggers command
    list_triggers_parser = subparsers.add_parser('list-triggers', help='List all triggers for a given app')
    list_triggers_parser.add_argument('app_name', type=str, help='Name of the app to list triggers for')
    list_triggers_parser.set_defaults(func=list_triggers)

    # Beta command group
    beta_parser = subparsers.add_parser('beta', help='Beta features commands')
    beta_subparsers = beta_parser.add_subparsers(help='beta commands', dest='beta_command')
    beta_subparsers.required = True

    # Update base_url command under beta
    update_base_url_parser = beta_subparsers.add_parser('update-base-url', help='Update the base URL for API calls')
    update_base_url_parser.add_argument('base_url', type=str, help='The new base URL to use for API calls')
    update_base_url_parser.set_defaults(func=update_base_url)

    # Logout command
    logout_parser = subparsers.add_parser('logout', help='Logout from the current session')
    logout_parser.set_defaults(func=logout)

    # Generate enums command
    generate_enums_parser = subparsers.add_parser('update', help='Update enums for apps and actions')
    generate_enums_parser.set_defaults(func=handle_update)

    # Generate beta enums command
    generate_enums_beta_parser = subparsers.add_parser('update-beta', help='Update enums including beta for apps and actions')
    generate_enums_beta_parser.set_defaults(func=handle_update_beta)

    return parser.parse_args()

def login(args):
    global should_disable_webbrowser_open
    client = ComposioCore()
    if client.is_authenticated():
        console.print("Already authenticated. Use [green]composio-cli logout[/green] to log out.\n")
        return
    
    console.print(f"\n[green]> Authenticating...[/green]\n")
    try:
        cli_key = client.generate_cli_auth_session()
        base_url = get_base_url()
        frontend_url = f"https://app.composio.dev/?cliKey={cli_key}" if base_url == 'https://backend.composio.dev/api' else f"https://hermes-frontend-git-master-composio.vercel.app/?cliKey={cli_key}"
        console.print(f"> Redirecting you to the login page. Please login using the following link:\n")
        console.print(f"[green]{frontend_url}[/green]\n")
        if not should_disable_webbrowser_open:
            webbrowser.open(f"{frontend_url}")

        for attempt in range(3):
            try:
                session_data = client.verify_cli_auth_session(cli_key, input("> Enter the code: "))
                api_key = session_data.get('apiKey')
                if api_key:
                    save_api_key(api_key)
                    console.print(f"\n[green]✔ Authenticated successfully![/green]\n")
                    break
            except UnauthorizedAccessException as e:
                if attempt == 2:  # Last attempt
                    console.print("[red]\nAuthentication failed after 3 attempts.[/red]")
                else:
                    console.print(f"[red] Invalid code. Please try again.[/red]")
                continue  # Exit the loop on unauthorized access
            except Exception as e:
                console.print(f"[red]Error occurred during authentication: {e}[/red]")
                if attempt == 2:  # Last attempt
                    console.print("[red]Authentication failed after 3 attempts.[/red]")
                    sys.exit(1)
    except Exception as e:
        console.print(f"[red] Error occurred during authentication: {e}[/red]")
        sys.exit(1)

def whoami(args):
    client = ComposioCore()
    user_info = client.get_authenticated_user()
    console.print(f"- API Key: [green]{user_info['api_key']}[/green]\n")
    return

def logout(args):
    client = ComposioCore()
    console.print(f"\n[green]> Logging out...[/green]\n")
    try:
        client.logout()
        console.print(f"\n[green]✔ Logged out successfully![/green]\n")
    except Exception as e:
        console.print(f"[red] Error occurred during logging out: {e}[/red]")
        sys.exit(1)

def update_base_url(args):
    client = ComposioCore()
    base_url = args.base_url
    console.print(f"\n[green]> Updating base URL to: {base_url}...[/green]\n")
    try:
        client.set_base_url(base_url)
        console.print(f"\n[green]✔ Base URL updated successfully![/green]\n")
    except Exception as e:
        console.print(f"[red] Error occurred during updating base URL: {e}[/red]")
        sys.exit(1)

def list_active_triggers(args):
    client = ComposioCore()
    console.print(f"\n[green]Listing all your active triggers...[/green]\n")
    try:
        triggers = client.list_active_triggers()
        if triggers:
            console.print("[bold]Active Triggers:[/bold]")
            table = Table(show_header=True, header_style="bold magenta")
            table.add_column("Trigger Name", style="dim", width=32)
            table.add_column("Trigger ID", style="dim", width=36)
            table.add_column("Connection ID",  style="dim", width=36)
            table.add_column("Connection config", style="dim", width=32)
            for trigger in triggers:
                trigger_config_str = json.dumps(trigger.triggerConfig)
                table.add_row(trigger.triggerName, trigger.id, trigger.connectionId, trigger_config_str)
            console.print(table)
        else:
            console.print("[red]No active triggers found for the specified app.[/red]\n")

        console.print("\n")
        console.print(f"To get more detailed info about trigger, use the command: [green]composio-cli get-trigger <trigger_name>[/green]\n")
    except Exception as e:
        console.print(f"[red]Error occurred during listing active triggers: {e}[/red]")
        sys.exit(1)

def get_trigger(args):
    client = ComposioCore()
    trigger_id = args.trigger_id
    console.print(f"\n[green]> Getting more details about trigger: {trigger_id}...[/green]\n")
    try:
        trigger = client.list_active_triggers([trigger_id])
        if len(trigger) > 0:
            console.print(f"[bold]Trigger Name:[/bold] {trigger[0].triggerName}")
            console.print(f"[bold]Trigger ID:[/bold] {trigger[0].id}")
            console.print(f"[bold]Connection ID:[/bold] {trigger[0].connectionId}")
            console.print(f"[bold]Connection Config:[/bold]\n")
            console.print(json.dumps(trigger[0].triggerConfig, indent=4))
            console.print("\n")
            console.print(f"To disable this trigger, use this command: [red]composio-cli disable-trigger {trigger_id}[/red]\n")
        else:
            console.print("[red]No trigger found with the specified ID or it's not active.[/red]\n")
            console.print(f"To list all active triggers, use the command: [green]composio-cli list-active-triggers[/green]\n")

    except Exception as e:
        console.print(f"[red]Error occurred during getting trigger: {e}[/red]")
        sys.exit(1)

def disable_trigger(args):
    client = ComposioCore()
    trigger_id = args.trigger_id
    console.print(f"\n[green]> Disabling trigger: {trigger_id}...[/green]\n")
    try:
        client.disable_trigger(trigger_id)
        console.print(f"\n[green]✔ Trigger disabled successfully![/green]\n")
    except Exception as e:
        console.print(f"[red] Error occurred during disabling trigger: {e}[/red]")
        sys.exit(1)

def list_triggers(args):
    client = ComposioCore()
    app_name = args.app_name
    console.print(f"\n[green]> Listing triggers for app: {app_name}...[/green]\n")
    try:
        triggers = client.list_triggers(app_name)
        if triggers:
            for trigger in triggers:
                console.print(f"[yellow]- {trigger['name']}: {trigger['description']} [/yellow]")
        else:
            console.print("[red] No triggers found for the specified app.[/red]")

        console.print("\n")
        console.print(f"To enable a trigger, use the command: [green] composio-cli enable-trigger <trigger_name>[/green]\n")
    except Exception as e:
        console.print(f"[red] Error occurred during listing triggers: {e}[/red]")
        sys.exit(1)

def enable_trigger(args):
    client = ComposioCore()
    trigger_name = args.trigger_name
    console.print(f"\n[green]> Enabling trigger: {trigger_name}...[/green]\n")
    try:
        trigger_requirements = client.get_trigger_requirements(trigger_ids=[trigger_name])
        if not trigger_requirements or len(trigger_requirements) == 0:
            console.print(f"[red] Trigger not found for the specified app.[/red]")
            sys.exit(1)
        if not isinstance(trigger_requirements, list):
            console.print(f"[red]Unexpected format for trigger requirements. Expected a list but got {trigger_requirements}.[/red]")
            sys.exit(1)
        app_key = trigger_requirements[0]["appKey"]
        trigger_requirements = trigger_requirements[0]["config"]
        required_fields = trigger_requirements.get('required', [])
        properties = trigger_requirements.get('properties', {})
        user_inputs = {}
        for field in required_fields:
            field_props = properties.get(field, {})
            field_title = field_props.get('title', field)
            field_description = field_props.get('description', '')
            user_input = input(f"{field_title} ({field_description}): ")
            user_inputs[field] = user_input
        
        app_enum = client.get_action_enum(app_key)
        if not app_enum:
            console.print(f"[red]No such app found for {app_key}.\nUse the following command to get list of available apps: [green]composio-cli add show-apps[/green][/red]")
            sys.exit(1)
        
        connected_account = client.get_connection(app_key)
        if not connected_account:
            console.print(f"[red]No connection found for {app_key}.\nUse the following command to add a connection: [green]composio-cli add {app_key}[/green][/red]")
            sys.exit(1)
        # Assuming there's a function to enable the trigger with user inputs
        resp = client.enable_trigger(trigger_name, connected_account.id, user_inputs)
        console.print(f"\n[green]✔ Trigger enabled successfully![/green]\n")
        if 'triggerId' in resp:
            console.print(f"[green]Trigger ID: {resp['triggerId']}[/green]")
    except Exception as e:
       try:
         error_json = json.loads(str(e))
         error_message = error_json.get("message", "Error message not found")
         console.print(f"[red]Error: {error_message}[/red]")
       except json.JSONDecodeError:
         console.print(f"[red]Error occurred during enabling trigger: {str(e)}[/red]")
       sys.exit(1)

def set_global_trigger_callback(args): 
    client = ComposioCore()
    console.print(f"\n[green]> Setting global trigger callback to: {args.callback_url}...[/green]\n")
    try:
        client.set_global_trigger(args.callback_url)
        console.print(f"\n[green]✔ Global trigger callback set successfully![/green]\n")
    except Exception as e:
        console.print(f"[red] Error occurred during setting global trigger callback: {e}[/red]")
        sys.exit(1)

def handle_update(args):
    generate_enums()
    console.print(f"\n[green]✔ Enums updated successfully![/green]\n")
    
def handle_update_beta(args):
    generate_enums_beta()
    console.print(f"\n[green]✔ Enums(including Beta) updated successfully![/green]\n")

def add_integration(args):
    global should_disable_webbrowser_open

    client = ComposioCore()
    integration_name = args.integration_name

    entity = client.sdk.get_entity("default")
    existing_connection = client.get_connection(integration_name, entity_id="default")
    if existing_connection is not None:
        console.print(f"[yellow]Warning: An existing connection for {integration_name} was found.[/yellow]\n")
        replace_connection = input("> Do you want to replace the existing connection? (yes/no): ").lower()
        if replace_connection not in ['yes', 'y']:
            console.print("\n[green]Existing connection retained. No new connection added.[/green]\n")
            return

    console.print(f"\n[green]> Adding integration: {integration_name.capitalize()}...[/green]\n")
    try:
        app = client.sdk.get_app(args.integration_name)
        auth_schemes = app.get('auth_schemes')
        auth_schemes_arr = [auth_scheme.get('auth_mode') for auth_scheme in auth_schemes]
        if len(auth_schemes_arr) > 1 and auth_schemes_arr[0] == 'API_KEY':
            connection = entity.initiate_connection(integration_name.lower())
            fields = auth_schemes[0].get('fields')
            fields_input = {}
            for field in fields:
                if field.get('expected_from_customer', True):
                    if field.get('required', False):
                        console.print(f"[green]> Enter {field.get('displayName', field.get('name'))}: [/green]", end="")
                        value = input() or field.get('default')
                        if not value:  # If a required field is not provided and no default is available
                            console.print(f"[red]Error: {field.get('displayName', field.get('name'))} is required[/red]")
                            sys.exit(1)
                    else:
                        console.print(f"[green]> Enter {field.get('displayName', field.get('name'))} (Optional): [/green]", end="")
                        value = input() or field.get('default')
                    fields_input[field.get('name')] = value

            connection.save_user_access_data(fields_input)
        else: 
            # @TODO: add logic to wait and ask for API_KEY
            connection = entity.initiate_connection(integration_name.lower())
            if not should_disable_webbrowser_open:
                webbrowser.open(connection.redirectUrl)
            print(f"Please authenticate {integration_name} in the browser and come back here. URL: {connection.redirectUrl}")
            spinner = Spinner(DOTS, f"[yellow]⚠[/yellow] Waiting for {integration_name} authentication...")
            spinner.start()
            connected_account = connection.wait_until_active()
            spinner.stop()
        print("")
        console.print(f"[green]✔[/green] {integration_name} added successfully!")
    except Exception as e:
        console.print(f"[red] Error occurred during adding integration: {e}[/red]")
        sys.exit(1)

def show_apps(args):
    client = ComposioCore()
    apps_list = client.sdk.get_list_of_apps()
    app_names_list = [{"name": app.get('name'), "uniqueId": app.get('key'), "appId": app.get('appId')} for app in apps_list.get('items')]
    console.print("\n[green]> Available apps supported by composio:[/green]\n")
    i = 1
    for app in app_names_list:
        print(f"• {app['uniqueId']}")
        i = i + 1

    print("\n")

def list_connections(args):
    client = ComposioCore()
    appName = args.appName
    console.print(f"\n[green]> Listing connections for: {appName}...[/green]\n")
    try:
        connections = client.get_list_of_connections([appName])
        if connections:
            for connection in connections:
                console.print(f"[yellow]- {connection['integrationId']} ({connection['status']})[/yellow]")
        else:
            console.print("[red] No connections found for the specified app.[/red]")
    except Exception as e:
        console.print(f"[red] Error occurred during listing connections: {e}[/red]")
        sys.exit(1)

def check_for_updates():
    try:
        installed_version = version('composio_core')
    except Exception as e:
        installed_version = "dev"
        console.print(f"[red]Error fetching Composio Core version: {e}[/red]")

    response = requests.get("https://pypi.org/pypi/composio_core/json")
    latest_pypi_version = response.json()['info']['version']

    console.print(f"\n Version: {installed_version} \n")

    if(latest_pypi_version > installed_version):
        console.print(f"\n[yellow] 🧐🧐 A newer version {latest_pypi_version} of composio-core is available. Please upgrade.[/yellow]")
        console.print(f"\n 🔧🔧 Run [cyan]pip install --upgrade composio-core=={latest_pypi_version} [/cyan] to update.\n")

def print_intro():
        text = termcolor.colored('Composio', 'white', attrs=['bold'])  
        aiPlatformText = termcolor.colored('100+', 'green', attrs=['bold'])
        pinkEmojiText = termcolor.colored('hello@composio.dev', 'magenta', attrs=['bold'])
        boldNoteText = termcolor.colored('Note*', 'white', attrs=['bold'])
        print(f"""
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                                       {text}                            │
│                                                                           │
│                     Plug {aiPlatformText} platforms in your agent                     │
│                                                                           │
│ {boldNoteText}: This package is in closed beta, please contact {pinkEmojiText}  │
│        to get early access.                                               │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
        """)
        check_for_updates()

def main():
    print_intro()

    args = parse_arguments()

    client = ComposioCore()

    if not client.is_authenticated() and args.func.__name__ not in ['logout', 'whoami', 'login', 'update_base_url']:
        login(args)
        print("\n")

    if hasattr(args, 'func'):
        try:
            args.func(args)
        except Exception as e:
            console.print(f"[red]> Error occurred during command execution: \n{e}[/red]")
            sys.exit(1)
    else:
        console.print("[red]Error: No valid command provided. Use --help for more information.[/red]")
