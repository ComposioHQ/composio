"""
Logout utility for composio CLI

Usage:
    composio logout
"""


import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.exceptions import ComposioSDKError


class Examples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio logout", fg="green")
        + click.style("  # Logout from the Composio SDK\n", fg="black"),
    ]


@click.command(name="logout", cls=Examples)
@click.help_option("--help", "-h", "-help")
@pass_context
def _logout(context: Context) -> None:
    """Logout from the Composio SDK"""
    try:
        context.user_data.api_key = None
        context.user_data.store()
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
