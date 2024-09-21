"""
Logout utility for composio CLI

Usage:
    composio logout
"""

import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.helpfulcmd import HelpfulCmdBase


class Examples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio logout", fg="green")
        + click.style("  # Logout from the Composio SDK\n", fg="black"),
    ]


@click.command(name="logout", cls=Examples)
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@pass_context
def _logout(context: Context) -> None:
    """Logout from the Composio SDK"""
    user_data = context.user_data
    user_data.api_key = None
    user_data.store()
