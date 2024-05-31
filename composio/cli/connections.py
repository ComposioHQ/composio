"""
Integrations manager for Composio SDK.

Usage:
    composio connections [command] [options]
"""

import click

from composio.cli.context import Context, pass_context
from composio.exceptions import ComposioSDKError


@click.group(name="connections", invoke_without_command=True)
@pass_context
def _connections(context: Context) -> None:
    """List composio connections for your account"""
    if context.click_ctx.invoked_subcommand:
        return

    connections = context.client.connected_accounts.get()
    for connection in connections:
        print(connection)


@_connections.command(name="get")
@click.argument("id", type=str)
@pass_context
def _get(context: Context, id: str) -> None:
    """Get connection information"""
    try:
        connection = context.client.get_entity().get_connection(
            connected_account_id=id,
        )
        context.console.print(f"[green]App:[/green] {connection.appUniqueId}")
        context.console.print(f"[green]Id:[/green] {connection.id}")
        context.console.print(f"[green]Status:[/green] {connection.status}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
