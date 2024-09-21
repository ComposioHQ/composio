"""
Login utility for composio SDK.

Usage:
    composio login
"""

import click

from composio.cli.context import Context, login, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.helpfulcmd import HelpfulCmdBase


class Examples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio login --help", fg="green")
        + click.style("  # Display help for login command\n", fg="black"),
        click.style("composio login --no-browser", fg="green")
        + click.style("  # Login without browser interaction\n", fg="black"),
    ]


@click.command(name="login", cls=Examples)
@click.option(
    "--no-browser",
    is_flag=True,
    default=False,
    help="Prevent from opening browser window",
)
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@pass_context
def _login(
    context: Context,
    no_browser: bool = False,
) -> None:
    """Login to the Composio SDK"""

    if context.is_logged_in():
        context.console.print("\n[green]✔ You're already logged in![/green]\n")
        context.console.print(
            "> Use [green]'composio logout'[/green] to log out and then login again"
        )
        return

    if context.using_api_key_from_env():
        context.console.print(
            "[yellow]WARNING: `COMPOSIO_API_KEY` Environment variable is set[/yellow]"
        )

    context.console.print("\n> [green]Authenticating...[/green]")
    login(context=context, no_browser=no_browser)
