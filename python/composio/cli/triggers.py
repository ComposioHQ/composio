"""
Triggers manager for Composio SDK.

Usage:
    composio triggers [command] [options]
"""

import json
import typing as t

import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.client.exceptions import NoItemsFound
from composio.core.cls.did_you_mean import DYMGroup
from composio.exceptions import ComposioSDKError


class TriggersExamples(HelpfulCmdBase, DYMGroup):
    examples = [
        click.style("composio triggers", fg="green")
        + click.style("              # List all triggers\n", fg="black"),
        click.style("composio triggers --active", fg="green")
        + click.style("     # List only active triggers\n", fg="black"),
        click.style("composio triggers --id 12345", fg="green")
        + click.style("   # List trigger with specific ID\n", fg="black"),
        click.style("composio triggers --app MyApp", fg="green")
        + click.style("  # List triggers for a specific app\n", fg="black"),
    ]


@click.group(name="triggers", invoke_without_command=True, cls=TriggersExamples)
@click.help_option("--help", "-h", "-help")
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


class GetTriggerExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio triggers get <trigger_id>", fg="green")
        + click.style("  # Get details of a specific trigger by ID\n", fg="black"),
    ]


@_triggers.command(name="get", cls=GetTriggerExamples)
@click.argument("id", type=str)
@click.help_option("--help", "-h", "-help")
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


class EnableTriggerExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio triggers enable <trigger_id>", fg="green")
        + click.style("  # Enable a trigger for an app\n", fg="black"),
    ]


@_triggers.command(name="enable", cls=EnableTriggerExamples)
@click.argument("name", type=str)
@click.help_option("--help", "-h", "-help")
@pass_context
def _enable_trigger(context: Context, name: str) -> None:
    """Enable a trigger for an app"""
    context.console.print(f"Enabling trigger [green]{name}[/green]")
    try:
        triggers = context.client.triggers.get(trigger_names=[name])
        if len(triggers) == 0:
            raise click.ClickException(f"Trigger with name {name} not found")
        trigger = triggers[0]
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
            name=name,
            connected_account_id=connected_account.id,
            config=config,
        )
        context.console.print(
            f"Enabled trigger with ID: [green]{response['triggerId']}[/green]"
        )
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


class DisableTriggerExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio triggers disable <trigger_id>", fg="green")
        + click.style("  # Disable a trigger for an app\n", fg="black"),
    ]


@_triggers.command(name="disable", cls=DisableTriggerExamples)
@click.argument("id", type=str)
@click.help_option("--help", "-h", "-help")
@pass_context
def _disable_trigger(context: Context, id: str) -> None:
    """Disable a trigger for an app"""
    context.console.print(f"Disabling trigger [green]{id}[/green]")
    try:
        response = context.client.triggers.disable(id=id)
        if response["status"] == "success":
            context.console.print(f"Disabled trigger with ID: [green]{id}[/green]")
            return
        raise click.ClickException(f"Could not disable trigger with ID: {id}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


@_triggers.group(name="callbacks")
def _callbacks() -> None:
    """Manage trigger callbacks."""


class SetCallbackExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio triggers callbacks set <callback_url>", fg="green")
        + click.style("  # Set callback URL\n", fg="black"),
    ]


@_callbacks.command(name="set", cls=SetCallbackExamples)
@click.argument("url", type=str)
@click.help_option("--help", "-h", "-help")
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


class GetCallbackExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio triggers callbacks get", fg="green")
        + click.style("  # Get callback URL\n", fg="black"),
    ]


@_callbacks.command(name="get", cls=GetCallbackExamples)
@click.help_option("--help", "-h", "-help")
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
