"""
Integrations manager for Composio SDK.

Usage:
    composio integrations [command] [options]
"""

import click

from composio.cli.context import Context, login_required, pass_context
from composio.exceptions import ComposioSDKError


@click.group(name="integrations", invoke_without_command=True)
@login_required
@pass_context
def _integrations(context: Context) -> None:
    """List composio integrations for your account"""
    if context.click_ctx.invoked_subcommand:
        return

    try:
        integrations = context.client.integrations.get()
        context.console.print("[green]Showing integrations[/green]")
        for integration in integrations:
            context.console.print(f"• App: {integration.appName}")
            context.console.print(f"  ID : {integration.id}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
