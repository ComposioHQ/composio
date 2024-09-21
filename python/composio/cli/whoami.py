"""
User information.

Usage:
    composio whoami
"""

import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.helpfulcmd import HelpfulCmdBase


class WhoamiExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio whoami", fg="green")
        + click.style("  # Display your account information\n", fg="black"),
    ]


@click.command(name="whoami", cls=WhoamiExamples)
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@pass_context
def _whoami(context: Context) -> None:
    """List your account information"""
    context.console.print(f"API Key: [green]{context.user_data.api_key}[/green]")
