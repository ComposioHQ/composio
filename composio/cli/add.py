"""
Add new integration.

Usage:
    composio add [options]
"""

import typing as t

import click

from composio.cli.context import Context, login_required, pass_context
from composio.cli.integrations import (
    add_integration,
    pass_entity_id,
    pass_integration_id,
)
from composio.exceptions import ComposioSDKError


@click.command(name="add")
@click.argument("name", type=str)
@click.option(
    "--no-browser",
    is_flag=True,
    default=False,
    help="Don't open browser for verifying connection",
)
@login_required
@pass_entity_id
@pass_integration_id
@pass_context
def _add(
    context: Context,
    name: str,
    entity_id: str,
    integration_id: t.Optional[str],
    no_browser: bool = False,
) -> None:
    """Add a new integration."""
    try:
        add_integration(
            name=name,
            context=context,
            entity_id=entity_id,
            integration_id=integration_id,
            no_browser=no_browser,
        )
    except ComposioSDKError as e:
        raise click.ClickException(
            message=e.message,
        ) from e
