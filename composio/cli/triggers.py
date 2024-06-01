"""
Triggers manager for Composio SDK.

Usage:
    composio triggers [command] [options]
"""

import json
import typing as t

import click

from composio.cli.context import Context, pass_context
from composio.client.exceptions import NoItemsFound
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
    """List triggers available for your account"""
    if context.click_ctx.invoked_subcommand:
        return

    try:
        if active or len(trigger_ids):
            triggers = context.client.active_triggers.get(trigger_ids=list(trigger_ids))
            if not triggers:
                raise click.ClickException("No active triggers found!")
            context.console.print("[green]Showing active triggers[/green]")
            for trg in triggers:
                context.console.print(f"• Name: {trg.triggerName}\n  ID: {trg.id}")
            return

        context.console.print("[green]Showing all triggers[/green]")
        for _trigger in context.client.triggers.get(app_names=list(app_names)):
            context.console.print(f"• {_trigger.name}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


@_triggers.command(name="get")
@click.argument("id", type=str)
@pass_context
def _get(context: Context, id: str) -> None:
    """Get a specific trigger information."""
    context.console.print(
        f"\n[green]> Getting more details about trigger: {id}...[/green]\n"
    )
    try:
        (trigger,) = context.client.active_triggers.get(trigger_ids=[id])
        context.console.print(f"[bold]Trigger Name:[/bold] {trigger.triggerName}")
        context.console.print(f"[bold]Trigger ID:[/bold] {trigger.id}")
        context.console.print(f"[bold]Connection ID:[/bold] {trigger.connectionId}")
        context.console.print(
            f"[bold]Connection Config:[/bold] {json.dumps(trigger.triggerConfig, indent=2)}"
        )
        context.console.print(
            f"[bold]Disable this trigger using[/bold]: [red]composio-cli disable-trigger {id}[/red]"
        )
    except NoItemsFound as e:
        raise click.ClickException(
            message=(
                "No trigger found with the specified ID or it's not active; "
                "To list all active triggers, use the command: "
                "\n\tcomposio triggers --active"
            )
        ) from e
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


@_triggers.command(name="enable")
@click.argument("id", type=str)
@pass_context
def _enable_trigger(context: Context, id: str) -> None:
    """Enable a trigger for an app"""
    context.console.print(f"Enabling trigger [green]{id}[/green]")
    try:
        (trigger,) = context.client.triggers.get(trigger_ids=[id])
        connected_account = context.client.get_entity().get_connection(
            app=trigger.appKey
        )

        config = {}
        properties = trigger.config.properties or {}
        for field in trigger.config.required or []:
            field_props = properties[field]
            field_title = field_props.title or field
            field_description = field_props.description or ""
            config[field] = click.prompt(text=f"{field_title} ({field_description})")

        response = context.client.triggers.enable(
            name=id,
            connected_account_id=connected_account.id,
            config=config,
        )
        context.console.print(
            f"Enabled trigger with ID: [green]{response['triggerId']}[/green]"
        )
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


@_triggers.command(name="disable")
@click.argument("id", type=str)
@pass_context
def _disable_trigger(context: Context, id: str) -> None:
    """Disable a trigger for an app"""
    context.console.print(f"Disabling trigger [green]{id}[/green]")
    try:
        response = context.client.triggers.disable(id=id)
        if response["status"] == "success":
            context.console.print(f"Enabled trigger with ID: [green]{id}[/green]")
            return
        raise click.ClickException(f"Could not disable trigger with ID: {id}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


@_triggers.group(name="callbacks")
def _callbacks() -> None:
    """Manage trigger callbacks."""


@_callbacks.command(name="set")
@click.argument("url", type=str)
@pass_context
def _set_callback(context: Context, url: str) -> None:
    """
    Set callback URL

    Note: Currently this command will set the provided URL as global callback URL
    """
    try:
        response = context.client.triggers.callbacks.set(url=url)
        context.console.print(response["message"])
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message)


@_callbacks.command(name="get")
@pass_context
def _get_callback(context: Context) -> None:
    """
    Get callback URL
    """
    try:
        response = context.client.triggers.callbacks.get()
        context.console.print(response)
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message)
