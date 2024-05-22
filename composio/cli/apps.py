"""
Apps manager for Composio SDK.

Usage:
    composio apps [command] [options]
"""

import click

from composio.cli.context import Context, pass_context
from composio.exceptions import ComposioSDKError


@click.group(name="apps", invoke_without_command=True)
@click.option(
    "--enabled",
    is_flag=True,
    default=False,
    help="Only show apps which are enabled",
)
@pass_context
def _apps(context: Context, enabled: bool = False) -> None:
    """Manage composio apps"""
    try:
        apps = context.client.apps.get()
        if enabled:
            apps = [app for app in apps if app.enabled]
            context.console.print("[green]Showing apps which are enabled[/green]")
        else:
            context.console.print("[green]Showing all apps[/green]")
        for app in apps:
            context.console.print(f"• {app.name}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
