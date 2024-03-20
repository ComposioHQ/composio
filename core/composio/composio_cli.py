#!/usr/bin/env python3

import argparse
import json
import os
import sys
import time
from beaupy.spinners import Spinner, BARS, DOTS
from rich.console import Console
import termcolor
import requests
from uuid import getnode as get_mac
from .sdk.storage import save_user_connection
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

    # Generate enums command
    generate_enums_parser = subparsers.add_parser('update', help='Update enums for apps and actions')
    generate_enums_parser.set_defaults(func=handle_update)

    return parser.parse_args()

def handle_update(args):
    generate_enums()
    console.print(f"\n[green]✔ Enums updated successfully![/green]\n")

def add_integration(args):
    client = ComposioCore()
    auth_user(client)

    integration_name = args.integration_name
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
    unique_identifier = f"{user_mac_address}-autogen"
    
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