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

from .sdk.client import ComposioClient

from composio_autogen.lib.api import get_redirect_url_for_integration, wait_for_tool_auth_completion
from composio_autogen.lib.storage import setup_autogen_studio, install_skills, load_skills

console = Console()

ACCESS_TOKEN = "COMPOSIO-X3125-ZUA-1"

def parse_arguments():
    parser = argparse.ArgumentParser(description='Composio CLI for adding integrations and managing skills.')
    parser.add_argument('action', choices=['add'], help='Action to perform. Currently supports "add" for adding integrations.')
    parser.add_argument('integration_name', help='Name of the integration to add.')
    return parser.parse_args()

def add_integration(integration_name):
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

def main():
    args = parse_arguments()

    if args.action == 'add':
        user_data = get_user_id()
        if not user_data:
            try:
                user_mac_address = get_mac()
                unique_identifier = f"{user_mac_address}-autogen"
                session_token = identify_user(unique_identifier)
                if session_token:
                    save_user_id(session_token)
            except Exception as e:
                console.print(f"[red]Error occurred during user identification: {e}[/red]")
                sys.exit(1)

        add_integration(args.integration_name)

        db_manager = setup_autogen_studio()
        skills = load_skills()
        install_skills(db_manager)

        console.print("[green]> Integration and skills setup completed successfully! 🚀[/green]")

if __name__ == '__main__':
    main()

