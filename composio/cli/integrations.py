"""
Integrations manager for Composio SDK.

Usage:
    composio integrations [command] [options]
"""

import click

from composio.cli.context import Context, pass_context
from composio.exceptions import ComposioSDKError


@click.group(name="integrations", invoke_without_command=False)
@click.option(
    "--enabled",
    is_flag=True,
    default=False,
    help="Only show integrations which are enabled",
)
@pass_context
def _integrations(context: Context, enabled: bool = False) -> None:
    """Manage composio integrations"""
    try:
        integrations = context.client.integrations.get()
        if enabled:
            integrations = [
                integration for integration in integrations if integration.enabled
            ]
            context.console.print(
                "[green]Showing integrations which are enabled[/green]"
            )
        else:
            context.console.print("[green]Showing all integrations[/green]")
        for integration in integrations:
            context.console.print(f"• {integration.name}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


@_integrations.command(name="add")
@click.argument("name", type=str)
@pass_context
def _add(context: Context, name: str) -> None:
    """Add a new integration"""

    entity = context.client.get_entity()
    existing_connection = context.client.connected_accounts.get()
