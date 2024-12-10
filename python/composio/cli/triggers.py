"""
Triggers manager for Composio SDK.

Usage:
    composio triggers [command] [options]
"""

import json
import typing as t

import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.client.exceptions import NoItemsFound
from composio.core.cls.did_you_mean import DYMGroup


class TriggersExamples(HelpfulCmdBase, DYMGroup):
    examples = [
        click.style("composio triggers", fg="green")
        + click.style("              # List all triggers\n", fg="black"),
        click.style("composio triggers --active", fg="green")
        + click.style("     # List only active triggers\n", fg="black"),
        click.style("composio triggers enable SLACK_RECEIVE_MESSAGE", fg="green")
        + click.style("   # Enable a trigger\n", fg="black"),
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
@handle_exceptions()
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

    if active or len(trigger_ids):
        triggers = context.client.active_triggers.get(trigger_ids=list(trigger_ids))
        if not triggers:
            raise click.ClickException("No active triggers found!")
        context.console.print("[green]Showing active triggers[/green]")
        for trg in triggers:
            context.console.print(f"• Name: {trg.triggerName}\n  ID: {trg.id}")
        return

    context.console.print("[green]Showing all triggers[/green]")
    for _trigger in context.client.triggers.get(apps=list(app_names)):
        context.console.print(f"• {_trigger.name}")


@_triggers.command(name="show")
@click.argument("name", type=str)
@handle_exceptions()
@pass_context
def _show(context: Context, name: str) -> None:
    (trigger,) = context.client.triggers.get(trigger_names=[name])

    context.console.print(f"• Showing: [green][bold]{name}[/bold][/green]")
    context.console.print(
        f"• Enable using: [green]composio triggers enable {name.lower()}[/green]"
    )
    context.console.print("• Config schema")
    for prop, config in trigger.config.properties.items():
        context.console.print(
            f"    • [bold]{prop} ({config.type})[/bold]: {config.description}"
        )


class GetTriggerExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio triggers get <trigger_id>", fg="green")
        + click.style("  # Get details of a specific trigger by ID\n", fg="black"),
    ]


@_triggers.command(name="get", cls=GetTriggerExamples)
@click.argument("id", type=str)
@click.help_option("--help", "-h", "-help")
@handle_exceptions(
    {
        "cls": NoItemsFound,
        "message": (
            "No trigger found with the specified ID or it's not active; "
            "To list all active triggers, use the command: "
            "\n\tcomposio triggers --active"
        ),
    }
)
@pass_context
def _get(context: Context, id: str) -> None:
    """Get a specific trigger information."""
    context.console.print(
        f"\n[green]> Getting more details about trigger: {id}...[/green]\n"
    )
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


class EnableTriggerExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio triggers enable <trigger_id>", fg="green")
        + click.style("  # Enable a trigger for an app\n", fg="black"),
    ]


@_triggers.command(name="enable", cls=EnableTriggerExamples)
@click.argument("name", type=str)
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@pass_context
def _enable_trigger(context: Context, name: str) -> None:
    """Enable a trigger for an app"""
    context.console.print(f"Enabling trigger [green]{name}[/green]")
    triggers = context.client.triggers.get(trigger_names=[name])
    if len(triggers) == 0:
        raise click.ClickException(f"Trigger with name {name} not found")
    trigger = triggers[0]
    connected_account = context.client.get_entity().get_connection(app=trigger.appKey)

    config = {}
    properties = trigger.config.properties or {}
    # Populate default values for optional fields
    config.update(
        {
            field: field_props.default
            for field, field_props in properties.items()
            if field_props.default is not None
        }
    )

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


class DisableTriggerExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio triggers disable <trigger_id>", fg="green")
        + click.style("  # Disable a trigger for an app\n", fg="black"),
    ]


@_triggers.command(name="disable", cls=DisableTriggerExamples)
@click.argument("id", type=str)
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@pass_context
def _disable_trigger(context: Context, id: str) -> None:
    """Disable a trigger for an app"""
    context.console.print(f"Disabling trigger [green]{id}[/green]")
    response = context.client.triggers.disable(id=id)
    if response["status"] == "success":
        context.console.print(f"Disabled trigger with ID: [green]{id}[/green]")
        return
    raise click.ClickException(f"Could not disable trigger with ID: {id}")


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
@handle_exceptions()
@pass_context
def _set_callback(context: Context, url: str) -> None:
    """
    Set callback URL

    Note: Currently this command will set the provided URL as global callback URL
    """
    response = context.client.triggers.callbacks.set(url=url)
    context.console.print(response["message"])


class GetCallbackExamples(HelpfulCmdBase, click.Command):
    examples = [
        click.style("composio triggers callbacks get", fg="green")
        + click.style("  # Get callback URL\n", fg="black"),
    ]


@_callbacks.command(name="get", cls=GetCallbackExamples)
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@pass_context
def _get_callback(context: Context) -> None:
    """
    Get callback URL
    """
    response = context.client.triggers.callbacks.get()
    context.console.print(response)
