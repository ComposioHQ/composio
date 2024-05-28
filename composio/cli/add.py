"""
Add new integration.

Usage:
    composio add [options]
"""

import typing as t
import webbrowser

import click
from beaupy.spinners import DOTS, Spinner

from composio.cli.context import Context, login_required, pass_context
from composio.cli.decorators import pass_entity_id
from composio.client import AppModel, AuthSchemeField, IntegrationModel
from composio.client.exceptions import ComposioClientError
from composio.constants import DEFAULT_ENTITY_ID
from composio.exceptions import ComposioSDKError
from composio.utils.url import get_web_url


@click.command(name="add")
@click.argument("name", type=str)
@click.option(
    "--no-browser",
    is_flag=True,
    default=False,
    help="Don't open browser for verifying connection",
)
@click.option(
    "-i",
    "--integration-id",
    type=str,
    help="Specify intgration ID to use existing integration",
)
@login_required
@pass_entity_id
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


def _replace_connection() -> bool:
    """Prompt user to check if they want to replace the connection or not."""
    return (
        click.prompt(
            "> Do you want to replace the existing connection?",
            type=click.Choice(
                choices=("y", "n"),
                case_sensitive=False,
            ),
        )
        == "y"
    )


def _collect_input_fields(fields: t.List[AuthSchemeField]) -> t.Dict:
    """Collect"""
    inputs = {}
    for _field in fields:
        field = _field.model_dump()
        if field.get("expected_from_customer", True):
            if field.get("required", False):
                value = input(
                    f"> Enter {field.get('displayName', field.get('name'))}: "
                )
                if not value:
                    raise click.ClickException(
                        f"{field.get('displayName', field.get('name'))} is required"
                    )
            else:
                value = input(
                    f"Enter {field.get('displayName', field.get('name'))} (Optional):"
                ) or t.cast(
                    str,
                    field.get("default"),
                )
            inputs[field.get("name")] = value
    return inputs


def _load_integration(
    context: Context,
    integration_id: t.Optional[str] = None,
) -> t.Optional[IntegrationModel]:
    """Load integration model."""
    if integration_id is None:
        return None

    for integration in context.client.integrations.get():
        if integration.id == integration_id:
            return integration

    raise click.ClickException(f"No integration found with ID: `{integration_id}`")


def add_integration(
    name: str,
    context: Context,
    entity_id: str = DEFAULT_ENTITY_ID,
    integration_id: t.Optional[str] = None,
    no_browser: bool = False,
) -> None:
    """
    Add integration.

    :param name: App name.
    :param context: CLI runtime context.
    :param entity_id: Entity ID to use for creating integration.
    :param no_browser: Don't open browser.
    """
    entity = context.client.get_entity(id=entity_id)
    integration = _load_integration(
        context=context,
        integration_id=integration_id,
    )
    try:
        existing_connection = entity.get_connection(app=name)
    except ComposioClientError:
        existing_connection = None

    if existing_connection is not None:
        context.console.print(
            f"[yellow]Warning: An existing connection for {name} was found.[/yellow]\n"
        )
        if not _replace_connection():
            context.console.print(
                "\n[green]Existing connection retained. No new connection added.[/green]\n"
            )
            return

    context.console.print(
        f"\n[green]> Adding integration: {name.capitalize()}...[/green]\n"
    )
    app = t.cast(AppModel, context.client.apps.get(name=name))
    auth_schemes = app.auth_schemes or []
    auth_modes = [auth_scheme.auth_mode for auth_scheme in auth_schemes]
    # TOFIX: What about other auth schemes?
    if len(auth_modes) > 0 and auth_modes[0] in [
        "API_KEY",
        "BASIC",
        "SNOWFLAKE",
    ]:
        entity.initiate_connection(
            app_name=name.lower(),
            auth_mode=auth_modes[0],
            integration=integration,
        ).save_user_access_data(
            client=context.client,
            field_inputs=_collect_input_fields(
                fields=auth_schemes[0].fields,
            ),
            entity_id=entity.id,
        )
    else:
        connection = entity.initiate_connection(
            app_name=name,
            redirect_url=get_web_url(path="redirect"),
            integration=integration,
        )
        if not no_browser:
            webbrowser.open(
                url=str(connection.redirectUrl),
            )

        context.console.print(
            f"Please authenticate {name} in the browser and come back here. "
            f"URL: {connection.redirectUrl}"
        )
        spinner = Spinner(
            DOTS,
            f"[yellow]⚠[/yellow] Waiting for {name} authentication...",
        )
        spinner.start()
        connection.wait_until_active(
            client=context.client,
        )
        spinner.stop()
        context.console.print(f"[green]✔[/green] {name} added successfully!")
