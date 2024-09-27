"""
Composio workspace manager.
"""

import typing as t
from datetime import datetime
from uuid import uuid4

import click

from composio.cli.context import Context, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.params import EnumParam
from composio.client.collections import ComposioWorkspaceStatus
from composio.client.exceptions import HTTPError


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
    context.console.print(
        "[bold]ID                                     "
        + "Status        "
        + "TotalUptime[/bold]"
    )
    context.console.print("[bold]" + ("-" * 64) + "[/bold]")
    for workspace in workspaces:
        if status is not None and workspace.status != status:
            continue

        value = workspace.status.value
        value += (11 - len(value)) * " "
        uptime = workspace.totalUpTime
        if workspace.status == ComposioWorkspaceStatus.RUNNING:
            uptime += datetime.now().timestamp() - workspace.sessionStart.timestamp()  # type: ignore
        context.console.print(f"[bold]{workspace.id}[/bold]   {value}   {int(uptime)}")
    context.console.print("[bold]" + ("-" * 64) + "[/bold]")


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
@click.argument("id")
@handle_exceptions()
@pass_context
def _start(context: Context, id: str) -> None:
    """Stop workspace with given ID"""
    try:
        workspace = context.client.workspaces.get(id=id)
    except HTTPError as e:
        raise click.ClickException(f"Workspace with ID {id} not found") from e

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
@click.argument("id")
@handle_exceptions()
@pass_context
def _stop(context: Context, id: str) -> None:
    """Stop workspace with given ID"""
    try:
        workspace = context.client.workspaces.get(id=id)
    except HTTPError as e:
        raise click.ClickException(f"Workspace with ID {id} not found") from e

    if workspace.status not in (ComposioWorkspaceStatus.RUNNING,):
        raise click.ClickException(
            "Workspace needs to be in `RUNNING` state to trigger a stop"
        )

    context.console.print(f"Stopping [bold]{id}[/bold]")
    context.client.workspaces.stop(id=id)
    context.client.workspaces.wait(id=id, status=ComposioWorkspaceStatus.STOPPED)
    context.console.print(f"Stopped [bold]{id}[/bold]")


@_workspaces.command(name="remove")
@click.argument("id")
@handle_exceptions()
@pass_context
def _remove(context: Context, id: str) -> None:
    """Remove workspace with given ID"""
    context.console.print(f"Removing [bold]{id}[/bold]")
    context.client.workspaces.remove(id=id)
    context.client.workspaces.wait(id=id, status=ComposioWorkspaceStatus.SUSPENDED)
    context.console.print(f"Removed [bold]{id}[/bold]")
