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

    if context.using_api_key_from_env():
        context.console.print(
            "[yellow]WARNING: `COMPOSIO_API_KEY` Environment variable is set[/yellow]"
        )

    context.console.print("\n> [green]Authenticating...[/green]")
    try:
        key = Composio.generate_auth_key()
        url = get_web_url(path=f"?cliKey={key}")
        context.console.print(
            "> Please login using the following link"
            if no_browser
            else "> Redirecting you to the login page"
        )
        context.console.print(f"> [green]{url}[/green]")
        if not no_browser:
            webbrowser.open(url)
        code = click.prompt("> Enter authentication code")
        api_key = Composio.validate_auth_session(
            key=key,
            code=code,
        )
        if context.using_api_key_from_env() and api_key != context.user_data.api_key:
            context.console.print(
                "> [yellow]WARNING: API Key from environment does not match "
                "with the one retrieved from login[/yellow]"
            )
        context.user_data.api_key = api_key
        context.user_data.store()
        context.console.print("✔ [green]Authenticated successfully![/green]")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
