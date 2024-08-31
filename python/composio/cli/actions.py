"""
Actions manager for Composio SDK.

Usage:
    composio actions [command] [options]
"""

import typing as t

import click
import pyperclip

from composio.cli.context import Context, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.client import App
from composio.core.cls.did_you_mean import DYMGroup
from composio.utils.enums import get_enum_key


class ActionsExamples(HelpfulCmdBase, DYMGroup):
    examples = [
        click.style("composio actions", fg="green")
        + click.style(
            "                                    # List all actions\n", fg="black"
        ),
        click.style("composio actions --app slack", fg="green")
        + click.style(
            "                        # List all actions for the Slack app\n", fg="black"
        ),
        click.style("composio actions --use-case 'get channel messages'", fg="green")
        + click.style(
            "  # List all actions for the 'get channel messages' use case\n", fg="black"
        ),
        click.style(
            "composio actions execute 'action_name' --params '{\"key\": \"value\"}'",
            fg="green",
        )
        + click.style("  # Execute a specific action with parameters\n", fg="black"),
    ]


@click.group(name="actions", invoke_without_command=True, cls=ActionsExamples)
@click.help_option("--help", "-h", "-help")
@click.option(
    "--app",
    "apps",
    type=str,
    multiple=True,
    help="Filter by app name",
)
@click.option(
    "--tag",
    "tags",
    type=str,
    multiple=True,
    help="Filter by given tag",
)
@click.option(
    "--use-case",
    "use_case",
    type=str,
    help="Filter by app name",
)
@click.option(
    "--limit",
    "limit",
    type=int,
    default=10,
    help="Limit the number of actions to show",
)
@click.option(
    "--enabled",
    is_flag=True,
    default=False,
    help="Only show actions which are enabled",
)
@click.option(
    "--copy",
    "copy_enums",
    is_flag=True,
    default=False,
    help="Copy actions as a list of `Action` enum instances.",
)
@handle_exceptions()
@pass_context
def _actions(
    context: Context,
    apps: t.Sequence[str],
    tags: t.Sequence[str],
    use_case: t.Optional[str] = None,
    limit: int = 10,
    enabled: bool = False,
    copy_enums: bool = False,
) -> None:
    """List composio actions"""
    if context.click_ctx.invoked_subcommand:
        return

    if enabled:
        context.console.print("[yellow]`--enabled` is deprecated![/yellow]")

    if use_case is not None and len(apps) == 0:
        raise click.ClickException(
            "To search by a use case you need to specify at least one app name."
        )

    context.console.print("[green]Showing all actions[/green]")
    actions = context.client.actions.get(
        apps=[App(app) for app in apps],
        limit=limit,
        allow_all=True,
        use_case=use_case,
    )

    enum_strs = []
    for action in actions:
        if len(tags) > 0 and all(tag not in action.tags for tag in tags):
            continue
        enum_strs.append(f"Action.{get_enum_key(name=action.name)}")
        context.console.print(f"• {action.name} ({enum_strs[-1]})")

    if len(tags) > 0 and len(enum_strs) == 0:
        raise click.ClickException(
            f"Could not find actions with following tags {set(tags)}"
        )

    if copy_enums or (
        click.prompt(
            "Do you copy these actions as enums?",
            type=click.Choice(
                choices=("y", "n"),
                case_sensitive=False,
            ),
        )
        == "y"
    ):
        pyperclip.copy(text="[" + ", ".join(enum_strs) + "]")
