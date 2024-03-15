#!/usr/bin/env python

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

from sdk.client import ComposioClient

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

    return parser.parse_args()

def add_integration(args):
    integration_name = args.integration_name
    console.print(f"\n[green]> Adding integration: {integration_name}...[/green]\n")
    tools = list_tools()
    tools_map = {tool["name"].capitalize(): tool for tool in tools["tools"]}

    if integration_name.capitalize() not in tools_map:
        console.print(f"[red]> Integration {integration_name} not found. Please check the name and try again.[/red]")
        return

    skillAgent = tools_map[integration_name.capitalize()]
    is_authenticated = skillAgent.get("Authentication", {}).get("isAuthenticated")
    if is_authenticated == "False":
        [auth_url, connReqId] = get_redirect_url_for_integration(integration_name.lower(), scopes=skillAgent.get("Authentication", {}).get("Scopes", []))
        spinner = Spinner(DOTS, f"[yellow]⚠[/yellow] {integration_name} requires authentication. Please visit the following URL to authenticate: {auth_url}")
        spinner.start()
        time.sleep(2)  # Simulate waiting time
        wait_for_tool_auth_completion(connReqId, integration_name)
        console.print(f"[green]✔[/green] {integration_name} authenticated successfully!")
        spinner.stop()
    else:
        console.print(f"[green]✔[/green] {integration_name} is already authenticated.")
    print("\n")

def show_apps(args):
    client = ComposioClient()
    auth_user(client)
    apps_list = client.get_list_of_apps()
    app_names_list = [{"name": app.get('name'), "uniqueId": app.get('key'), "appId": app.get('appId')} for app in apps_list.get('items')]
    console.print("\n[green]> Available apps supported by composio:[/green]\n")
    i = 1
    for app in app_names_list:
        print(f"• {app['uniqueId']}")
        i = i + 1

    print("\n")
    
def print_intro(): 
        text = termcolor.colored('Composio', 'white', attrs=['bold'])  
        aiPlatformText = termcolor.colored('100+', 'green', attrs=['bold'])
        pinkEmojiText = termcolor.colored('hello@composio.dev', 'magenta', attrs=['bold'])
        boldNoteText = termcolor.colored('Note*', 'white', attrs=['bold'])
        print(f"""
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                           {text} <-> AutoGen                            │
│                                                                           │
│                     Plug {aiPlatformText} platforms in your agent                     │
│                                                                           │
│ {boldNoteText}: This package is in closed beta, please contact {pinkEmojiText}  │
│        to get early access.                                               │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
        """)

def auth_user(client: ComposioClient):
    user_mac_address = get_mac()
    unique_identifier = f"{user_mac_address}-autogen"
    
    return client.authenticate(unique_identifier)

def main():
    print_intro()

    args = parse_arguments()

    client = ComposioClient()

    try:
        user = auth_user(client)
    except Exception as e:
        console.print(f"[red]Error occurred during user identification: {e}[/red]")
        sys.exit(1)

    if hasattr(args, 'func'):
        args.func(args)
    else:
        console.print("[red]Error: No valid command provided. Use --help for more information.[/red]")

if __name__ == '__main__':
    main()
