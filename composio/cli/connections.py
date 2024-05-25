"""
Integrations manager for Composio SDK.

Usage:
    composio connections [command] [options]
"""

import click

from composio.cli.context import Context, pass_context
from composio.client.enums import Action
from composio.exceptions import ComposioSDKError


@click.group(name="connections")
@pass_context
def _connections(context: Context) -> None:
    """Manage composio connections"""


@_connections.command(name="get")
@click.argument("name", type=str)
@pass_context
def _get(context: Context, name: str) -> None:
    """Get connection information"""
    try:
        connection = context.client.get_entity().get_connection(
            action=Action.from_app(
                name=name,
            )
        )
        context.console.print(f"[green]App:[/green] {name}")
        context.console.print(f"[green]Id:[/green] {connection.integrationId}")
        context.console.print(f"[green]Status:[/green] {connection.status}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
