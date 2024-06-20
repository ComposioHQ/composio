"""
Login utility for composio SDK.

Usage:
    composio login
"""

import webbrowser

import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.client import Composio
from composio.exceptions import ComposioSDKError
from composio.utils.url import get_web_url


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

    context.console.print("\n[green]> Authenticating...[/green]\n")
    try:
        key = Composio.generate_auth_key()
        url = get_web_url(path=f"?cliKey={key}")
        context.console.print(
            "> Redirecting you to the login page. Please login using the following link:\n"
        )
        context.console.print(f"[green]{url}[/green]\n")
        if not no_browser:
            webbrowser.open(url)
        code = click.prompt("> Enter authentication code: ")
        context.user_data.api_key = Composio.validate_auth_session(
            key=key,
            code=code,
        )
        context.user_data.store()
        context.console.print("\n[green]✔ Authenticated successfully![/green]\n")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
