#!/usr/bin/env python3

import argparse
import sys
from beaupy.spinners import Spinner, DOTS
from rich.console import Console
import termcolor
from uuid import getnode as get_mac
from .sdk.storage import get_user_connection, save_user_connection
from .sdk.core import ComposioCore
from .sdk.utils import generate_enums

import webbrowser

console = Console()

def parse_arguments():
    parser = argparse.ArgumentParser(description='Composio CLI for adding integrations, managing skills, and showing apps.')
    subparsers = parser.add_subparsers(help='commands', dest='command')
    subparsers.required = True

    # Add integration command
    add_parser = subparsers.add_parser('add', help='Add an integration')
    add_parser.add_argument('integration_name', type=str, help='Name of the integration to add')
    add_parser.set_defaults(func=add_integration)

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

    return parser.parse_args()

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
    auth_user(client)
    base_url = args.base_url
    console.print(f"\n[green]> Updating base URL to: {base_url}...[/green]\n")
    try:
        client.set_base_url(base_url)
        console.print(f"\n[green]✔ Base URL updated successfully![/green]\n")
    except Exception as e:
        console.print(f"[red] Error occurred during updating base URL: {e}[/red]")
        sys.exit(1)

def list_triggers(args):
    client = ComposioCore()
    auth_user(client)
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
    auth_user(client)
    trigger_name = args.trigger_name
    console.print(f"\n[green]> Enabling trigger: {trigger_name}...[/green]\n")
    try:
        trigger_requirements = client.get_trigger_requirements(trigger_ids=[trigger_name])
        if not trigger_requirements or len(trigger_requirements) == 0:
            console.print(f"[red] Trigger not found for the specified app.[/red]")
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
        
        user_connection = get_user_connection(app_key)
        if not user_connection:
            console.print(f"[red]No connection found for {app_key}.\nUse the following command to add a connection: [green]composio-cli add {app_key}[/green][/red]")
            sys.exit(1)
        
        connected_account_id = get_user_connection(app_key)
        # Assuming there's a function to enable the trigger with user inputs
        client.enable_trigger(trigger_name, connected_account_id, user_inputs)
        console.print(f"\n[green]✔ Trigger enabled successfully![/green]\n")
    except Exception as e:
        console.print(f"[red] Error occurred during enabling trigger: {e}[/red]")
        sys.exit(1)

def set_global_trigger_callback(args): 
    client = ComposioCore()
    auth_user(client)
    console.print(f"\n[green]> Setting global trigger callback to: {args.callback_url}...[/green]\n")
    try:
        client.set_global_trigger(args.callback_url)
        console.print(f"\n[green]✔ Global trigger callback set successfully![/green]\n")
    except Exception as e:
        console.print(f"[red] Error occurred during setting global trigger callback: {e}[/red]")
        sys.exit(1)

def handle_update(args):
    client = ComposioCore()
    auth_user(client)
    generate_enums()
    console.print(f"\n[green]✔ Enums updated successfully![/green]\n")

def add_integration(args):
    client = ComposioCore()
    auth_user(client)
    integration_name = args.integration_name

    existing_connection = get_user_connection(integration_name)
    if existing_connection is not None:
        console.print(f"[yellow]Warning: An existing connection for {integration_name} was found.[/yellow]\n")
        replace_connection = input("> Do you want to replace the existing connection? (yes/no): ").lower()
        if replace_connection not in ['yes', 'y']:
            console.print("\n[green]Existing connection retained. No new connection added.[/green]\n")
            return

    console.print(f"\n[green]> Adding integration: {integration_name.capitalize()}...[/green]\n")
    try:
        # @TODO: add logic to wait and ask for API_KEY
        connection = client.initiate_connection("test-" + integration_name.lower() + "-connector")
        webbrowser.open(connection.redirectUrl)
        print(f"Please authenticate {integration_name} in the browser and come back here. URL: {connection.redirectUrl}")
        spinner = Spinner(DOTS, f"[yellow]⚠[/yellow] Waiting for {integration_name} authentication...")
        spinner.start()
        connected_account = connection.wait_until_active()
        spinner.stop()
        save_user_connection(connected_account.id, integration_name)
        print("")
        console.print(f"[green]✔[/green] {integration_name} added successfully!")
    except Exception as e:
        console.print(f"[red] Error occurred during adding integration: {e}[/red]")
        sys.exit(1)

def show_apps(args):
    client = ComposioCore()
    auth_user(client)
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
    auth_user(client)
    appName = args.appName
    console.print(f"\n[green]> Listing connections for: {appName}...[/green]\n")
    try:
        connections = client.get_list_of_connections(appName)
        if connections:
            for connection in connections:
                console.print(f"[yellow]- {connection['integrationId']} ({connection['status']})[/yellow]")
        else:
            console.print("[red] No connections found for the specified app.[/red]")
    except Exception as e:
        console.print(f"[red] Error occurred during listing connections: {e}[/red]")
        sys.exit(1)
    
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

def auth_user(client: ComposioCore):
    user_mac_address = get_mac()
    unique_identifier = f"{user_mac_address}"
    
    return client.authenticate(unique_identifier)

def main():
    print_intro()

    args = parse_arguments()

    client = ComposioCore()

    try:
        user = auth_user(client)
    except Exception as e:
        console.print(f"[red]Error occurred during user identification: {e}[/red]")
        sys.exit(1)

    if hasattr(args, 'func'):
        args.func(args)
    else:
        console.print("[red]Error: No valid command provided. Use --help for more information.[/red]")
