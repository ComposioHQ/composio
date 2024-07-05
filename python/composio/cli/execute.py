import json
import typing as t

import click

from composio.cli.context import Context, pass_context
from composio.client.enums import Action
from composio.exceptions import ComposioSDKError


@click.command(name="execute")
@click.argument("action", type=str)
@click.option(
    "-p",
    "--params",
    type=str,
    help="Action parameters as a JSON string",
)
@click.option(
    "-m",
    "--metadata",
    type=str,
    help="Metadata for executing an action",
)
@pass_context
def _execute(
    context: Context,
    action: str,
    params: t.Optional[str] = None,
    metadata: t.Optional[str] = None,
) -> None:
    """Execute a Composio action"""
    try:
        context.console.print(
            json.dumps(
                obj=context.toolset.execute_action(
                    action=Action(action),
                    params=json.loads(params) if params else {},
                    metadata=json.loads(metadata) if metadata else {},
                )
            )
        )
    except json.JSONDecodeError as e:
        raise click.ClickException("Invalid JSON format for parameters") from e
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e
