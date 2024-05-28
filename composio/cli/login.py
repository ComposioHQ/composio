"""
Login utility for composio SDK.

Usage:
    composio login
"""

import webbrowser

import click

from composio.cli.context import Context, pass_context
from composio.client import Composio
from composio.exceptions import ComposioSDKError
from composio.utils.url import get_web_url


@click.command(name="login")
@click.option(
    "--no-browser",
    is_flag=True,
    default=False,
    help="Prevent from opening browser window",
)
@pass_context
def _login(
    context: Context,
    no_browser: bool = False,
) -> None:
    """Login to the Composio SDK API."""

    # TODO: Abstract away
    user_data = context.user_data
    if user_data.api_key is not None:
        raise click.ClickException("Already logged in!")

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
        user_data.api_key = Composio.validate_auth_session(
            key=key,
            code=code,
        )
        user_data.store()
        context.console.print("\n[green]✔ Authenticated successfully![/green]\n")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
