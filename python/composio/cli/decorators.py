"""
Common decorators for CLI commands.
"""

import click

from composio.constants import DEFAULT_ENTITY_ID


pass_entity_id = click.option(
    "-e",
    "--entity-id",
    help="Specify entity ID for creating the integration",
    type=str,
    default=DEFAULT_ENTITY_ID,
)
