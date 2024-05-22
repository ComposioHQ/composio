"""
Triggers manager for Composio SDK.

Usage:
    composio triggers [command] [options]
"""

import typing as t

import click

from composio.cli.context import Context, pass_context
from composio.exceptions import ComposioSDKError


@click.group(name="triggers", invoke_without_command=True)
@click.option(
    "--active",
    is_flag=True,
    default=False,
    help="Only list the active triggers",
)
@click.option(
    "--id",
    "trigger_ids",
    type=str,
    help="Filter by trigger id",
    multiple=True,
)
@click.option(
    "--app",
    "app_names",
    type=str,
    help="Filter by app name",
    multiple=True,
)
@pass_context
def _triggers(
    context: Context,
    trigger_ids: t.Tuple[str, ...],
    app_names: t.Tuple[str, ...],
    active: bool = True,
) -> None:
    """Manage triggers"""
    if context.click_ctx.invoked_subcommand:
        return

    try:
        if active or len(trigger_ids):
            triggers = [
                _trigger.triggerName
                for _trigger in context.client.active_triggers.get(
                    trigger_ids=list(trigger_ids)
                )
            ]
            if not triggers:
                raise click.ClickException("No active triggers found!")
            context.console.print("[green]Showing active triggers[/green]")
        else:
            triggers = [
                _trigger.name
                for _trigger in context.client.triggers.get(app_names=list(app_names))
            ]
            context.console.print("[green]Showing all triggers[/green]")
        for name in triggers:
            context.console.print(f"• {name}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


@_triggers.command(name="enable")
@click.argument("id", type=str)
@pass_context
def _enable_trigger(context: Context, id: str) -> None:
    """Enable a trigger for an app"""
    context.console.print(f"Enabling trigger [green]{id}[/green]")
    (trigger,) = context.client.triggers.get(trigger_ids=[id])
    connected_account = context.client.connected_accounts.get()
    # context.client.triggers.enable(name=)


@_triggers.command(name="disable")
def _disable_trigger() -> None:
    """Disable a trigger for an app"""
