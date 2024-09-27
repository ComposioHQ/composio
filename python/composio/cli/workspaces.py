"""
Composio workspace manager.
"""

import math
import typing as t
from datetime import datetime
from uuid import uuid4

import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.params import EnumParam
from composio.client.collections import ComposioWorkspaceStatus


def _fill(string: str, length: int) -> str:
    _length = len(string)
    if _length > length:
        return string[: length - 6] + "...   "
    return string + (" " * (length - _length))


def _get_workspace_id(name: str, context: Context) -> str:
    id = context.client.workspaces.find(name=name)
    if id is None:
        raise click.ClickException(f"Workspace with ID {id} not found")
    return id


@click.group(name="workspaces", invoke_without_command=True)
@click.option(
    "--status",
    type=EnumParam(
        cls=ComposioWorkspaceStatus,
    ),
    help="Workspace status filter.",
    required=False,
)
@handle_exceptions()
@pass_context
def _workspaces(
    context: Context,
    status: t.Optional[ComposioWorkspaceStatus] = None,
) -> None:
    """List workspaces available for your account"""
    if context.click_ctx.invoked_subcommand:
        return

    workspaces = context.client.workspaces.get()
    if len(workspaces) == 0:
        context.console.print("[yellow]No workspaces found[/yellow]")
        return

    context.console.print(
        "[bold]"
        + _fill("Name", 30)
        + _fill("Status", 13)
        + _fill("TotalUptime", 13)
        + "[/bold]"
    )
    context.console.print("[bold]" + ("-" * 60) + "[/bold]")
    for workspace in workspaces:
        if status is not None and workspace.status != status:
            continue

        value = workspace.status.value
        value += (11 - len(value)) * " "
        uptime = workspace.totalUpTime
        if workspace.status == ComposioWorkspaceStatus.RUNNING:
            uptime += datetime.now().timestamp() - workspace.sessionStart.timestamp()  # type: ignore

        context.console.print(
            "[bold]"
            + _fill(workspace.name, 30)
            + "[/bold]"
            + _fill(value, 13)
            + _fill(str(math.ceil(int(uptime) / 60)) + " minutes", 13)
        )
    context.console.print("[bold]" + ("-" * 60) + "[/bold]")


@_workspaces.command(name="provision")
@click.option(
    "-e",
    "--env",
    "environment",
    multiple=True,
    help="Define environment variabled, eg --env KEY=VALUE",
)
@handle_exceptions()
@pass_context
def _provision(context: Context, environment: t.Tuple[str, ...]) -> None:
    """Provision workspace"""
    id = context.client.workspaces.create(
        access_token=uuid4().hex.replace("-", ""),
        composio_api_key=context.client.api_key,
        composio_base_url=context.client.base_url,
        github_access_token=str(  # TOFIX: Make this optional on mercury
            context.toolset._try_get_github_access_token_for_current_entity()  # pylint: disable=protected-access
        ),
        environment=dict(var.split("=", maxsplit=1) for var in environment),
    )
    context.console.print(f"Provisioned workspace with ID: [bold]{id}[/bold]")


@_workspaces.command(name="start")
@click.argument("name")
@handle_exceptions()
@pass_context
def _start(context: Context, name: str) -> None:
    """Stop workspace with given ID"""
    id = _get_workspace_id(name=name, context=context)
    workspace = context.client.workspaces.get(id=id)
    if workspace.status not in (
        ComposioWorkspaceStatus.PROVISIONED,
        ComposioWorkspaceStatus.STOPPED,
    ):
        raise click.ClickException(
            "Workspace needs to be in `PROVISIONED` or `STOPPED` "
            "state to trigger a start"
        )

    context.console.print(f"Starting [bold]{id}[/bold]")
    context.client.workspaces.start(id=id)
    context.client.workspaces.wait(id=id, status=ComposioWorkspaceStatus.RUNNING)
    context.console.print(f"[bold]{id}[/bold] is running")


@_workspaces.command(name="stop")
@click.argument("name")
@handle_exceptions()
@pass_context
def _stop(context: Context, name: str) -> None:
    """Stop workspace with given ID"""
    id = _get_workspace_id(name=name, context=context)
    workspace = context.client.workspaces.get(id=id)
    if workspace.status not in (ComposioWorkspaceStatus.RUNNING,):
        raise click.ClickException(
            "Workspace needs to be in `RUNNING` state to trigger a stop"
        )

    context.console.print(f"Stopping [bold]{id}[/bold]")
    context.client.workspaces.stop(id=id)
    context.client.workspaces.wait(id=id, status=ComposioWorkspaceStatus.STOPPED)
    context.console.print(f"Stopped [bold]{id}[/bold]")


@_workspaces.command(name="remove")
@click.argument("name")
@handle_exceptions()
@pass_context
def _remove(context: Context, name: str) -> None:
    """Remove workspace with given ID"""
    id = _get_workspace_id(name=name, context=context)
    context.console.print(f"Removing [bold]{id}[/bold]")
    context.client.workspaces.remove(id=id)
    context.client.workspaces.wait(id=id, status=ComposioWorkspaceStatus.SUSPENDED)
    context.console.print(f"Removed [bold]{id}[/bold]")
