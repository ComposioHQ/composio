"""
User information.

Usage:
    composio whoami
"""

import click

from composio.cli.context import Context, pass_context
from composio.exceptions import ComposioSDKError


@click.command(name="whoami")
@pass_context
def _whoami(context: Context) -> None:
    """Manage composio whoami"""
    try:
        context.console.print(f"API Key: [green]{context.user_data.api_key}[/green]")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
