"""
Integrations manager for Composio SDK.

Usage:
    composio connections [command] [options]
"""

import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.core.cls.did_you_mean import DYMGroup


class ConnectionsExamples(HelpfulCmdBase, DYMGroup):
    examples = [
        click.style("composio connections", fg="green")
        + click.style("             # List all connections\n", fg="black"),
        click.style("composio connections get 123", fg="green")
        + click.style("     # Get details of connection with ID 123\n", fg="black"),
        click.style("composio connections delete 456", fg="green")
        + click.style("  # Delete connection with ID 456\n", fg="black"),
    ]


@click.group(name="connections", invoke_without_command=True, cls=ConnectionsExamples)
@click.option(
    "--active",
    help="Show only active connections",
    is_flag=True,
)
@click.help_option("--help", "-h", "-help")
@pass_context
def _connections(context: Context, active: bool = False) -> None:
    """List composio connections for your account"""
    if context.click_ctx.invoked_subcommand:
        return

    for connection in context.client.connected_accounts.get(active=active):
        context.console.print(f"• Id : {connection.id}")
        context.console.print(f"  App: {connection.appUniqueId}")


class GetExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio connections get 123", fg="green")
        + click.style("  # Get details of connection with ID 123\n", fg="black"),
    ]


@_connections.command(name="get", cls=GetExamples)
@click.argument("id", type=str)
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@pass_context
def _get(context: Context, id: str) -> None:
    """Get connection information"""
    connection = context.client.get_entity().get_connection(
        connected_account_id=id,
    )
    context.console.print(f"[green]App   :[/green] {connection.appUniqueId}")
    context.console.print(f"[green]Id    :[/green] {connection.id}")
    context.console.print(f"[green]Status:[/green] {connection.status}")
