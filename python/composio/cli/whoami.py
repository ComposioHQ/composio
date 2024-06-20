"""
User information.

Usage:
    composio whoami
"""

import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.exceptions import ComposioSDKError


class WhoamiExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio whoami", fg="green")
        + click.style("  # Display your account information\n", fg="black"),
    ]


@click.command(name="whoami", cls=WhoamiExamples)
@click.help_option("--help", "-h", "-help")
@pass_context
def _whoami(context: Context) -> None:
    """List your account information"""
    try:
        context.console.print(f"API Key: [green]{context.user_data.api_key}[/green]")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
