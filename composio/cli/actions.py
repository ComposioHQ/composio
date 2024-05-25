"""
Actions manager for Composio SDK.

Usage:
    composio actions [command] [options]
"""

import click

from composio.cli.context import Context, pass_context
from composio.exceptions import ComposioSDKError
from composio.client.enums import App
import typing as t


@click.group(name="actions", invoke_without_command=True)
@click.option(
    "--app",
    "apps",
    type=str,
    multiple=True,
    help="Filter by app name",
)
@click.option(
    "--use-case",
    "use_case",
    type=str,
    help="Filter by app name",
)
@click.option(
    "--enabled",
    is_flag=True,
    default=False,
    help="Only show actions which are enabled",
)
@pass_context
def _actions(
    context: Context,
    apps: t.Sequence[str],
    use_case: t.Optional[str] = None,
    enabled: bool = False,
) -> None:
    """Manage composio actions"""
    try:
        actions = context.client.actions.get(
            apps=[App(app) for app in apps],
            use_case=use_case,
            allow_all=True,
        )
        if enabled:
            actions = [integration for integration in actions if integration.enabled]
            context.console.print("[green]Showing actions which are enabled[/green]")
        else:
            context.console.print("[green]Showing all actions[/green]")
        for integration in actions:
            context.console.print(f"• {integration.name}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
