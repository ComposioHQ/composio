"""
Apps manager for Composio SDK.

Usage:
    composio apps [command] [options]
"""

import ast
import os.path
import shutil

import click

from composio import constants
from composio.cli.context import Context, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.client import Composio
from composio.client.enums.base import (
    ACTIONS_CACHE,
    APPS_CACHE,
    TAGS_CACHE,
    TRIGGERS_CACHE,
)
from composio.client.utils import update_actions, update_apps, update_triggers
from composio.core.cls.did_you_mean import DYMGroup
from composio.exceptions import ComposioSDKError


class AppsExamples(HelpfulCmdBase, DYMGroup):
    examples = [
        click.style("composio apps", fg="green")
        + click.style("                # List all apps\n", fg="black"),
        click.style("composio apps --enabled", fg="green")
        + click.style("      # List only enabled apps\n", fg="black"),
        click.style("composio apps generate-types", fg="green")
        + click.style(" # Update type stubs for enums\n", fg="black"),
    ]


@click.group(name="apps", invoke_without_command=True, cls=AppsExamples)
@click.help_option("--help", "-h", "-help")
@click.option(
    "--enabled",
    is_flag=True,
    default=False,
    help="Only show apps which are enabled",
)
@handle_exceptions()
@pass_context
def _apps(context: Context, enabled: bool = False) -> None:
    """List composio tools/apps which you have access to"""
    if context.click_ctx.invoked_subcommand:
        return

    apps = context.client.apps.get()
    if enabled:
        apps = [app for app in apps if app.enabled]
        context.console.print("[green]Showing apps which are enabled[/green]")
    else:
        context.console.print("[green]Showing all apps[/green]")

    for app in apps:
        context.console.print(f"• {app.key}")


@_apps.command(name="update")
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@pass_context
def _update(context: Context) -> None:
    """Deprecated, has no effect."""
    context.console.print(
        "[yellow]Warning:[/yellow] the 'apps update' command has been deprecated"
        " and has no effect.\n"
        "If you wish to update the local type stubs for auto-completion, use"
        " 'composio apps generate-types' instead."
    )


@_apps.command(name="generate-types")
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@pass_context
def _generate_types(context: Context) -> None:
    """Updates the local type stubs with the latest app data."""
    context.console.print("Fetching latest data from Composio API...")
    generate_type_stubs(context.client)
    context.console.print(
        "[green]Successfully updated type stubs for Apps, Actions, and Triggers[/green]"
    )


def generate_type_stub(enum_file: str, cache_folder: os.PathLike) -> None:
    # Get all enum filenames
    enum_names = sorted(os.listdir(cache_folder))

    # Get the enum class
    with open(enum_file, encoding="utf-8") as f:
        tree = ast.parse(f.read())

    enum_classes = [
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef)
        and isinstance(node.bases[0], ast.Subscript)
        and isinstance(node.bases[0].value, ast.Name)
        and node.bases[0].value.id == "Enum"
    ]
    if not enum_classes:
        raise ComposioSDKError(
            "No Enum class found in the SDK source, please re-install `composio`."
        )
    enum_class = enum_classes[0]

    # Remove the bodies of all methods in the class, replace with ellipsis
    for node in enum_class.body:
        if isinstance(node, ast.FunctionDef):
            node.body = [ast.Expr(ast.Constant(...))]

    # Add all enum names as class attributes
    for enum_name in enum_names:
        enum_class.body.append(
            ast.AnnAssign(
                target=ast.Name(id=enum_name, ctx=ast.Store()),
                annotation=ast.Constant(value=f"{enum_class.name}"),
                value=None,
                simple=1,
            )
        )

    # Write the type stub
    with open(enum_file + "i", "w", encoding="utf-8") as f:
        f.write(ast.unparse(tree))


def generate_type_stubs(client: Composio) -> None:
    # Update local cache first
    for cache_folder in ["apps", "actions", "triggers", "tags"]:
        shutil.rmtree(
            constants.LOCAL_CACHE_DIRECTORY / cache_folder,
            ignore_errors=True,
        )
    apps = update_apps(client)
    update_actions(client, apps)
    update_triggers(client, apps)

    enums_folder = os.path.join(os.path.dirname(__file__), "..", "client", "enums")
    apps_enum = os.path.join(enums_folder, "app.py")
    actions_enum = os.path.join(enums_folder, "action.py")
    triggers_enum = os.path.join(enums_folder, "trigger.py")
    tags_enum = os.path.join(enums_folder, "tag.py")

    for enum_file, cache_folder_path in [
        (apps_enum, APPS_CACHE),
        (actions_enum, ACTIONS_CACHE),
        (triggers_enum, TRIGGERS_CACHE),
        (tags_enum, TAGS_CACHE),
    ]:
        generate_type_stub(enum_file, cache_folder_path)
