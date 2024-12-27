"""
Add new integration.

Usage:
    composio add [options]
"""

import typing as t
import webbrowser

import click

from composio.cli.context import Context, ensure_login, pass_context
from composio.cli.utils.decorators import handle_exceptions, pass_entity_id
from composio.cli.utils.helpfulcmd import HelpfulCmd
from composio.client import Composio, Entity
from composio.client.collections import (
    AppAuthScheme,
    AppModel,
    AuthSchemeField,
    AuthSchemeType,
    IntegrationModel,
)
from composio.client.exceptions import ComposioClientError
from composio.constants import DEFAULT_ENTITY_ID
from composio.utils.url import get_web_url


class AddIntegrationExamples(HelpfulCmd):
    examples = [
        click.style("composio add <app_name>", fg="green")
        + click.style("                      # Add a new integration\n", fg="black"),
        click.style("composio add <app_name> --no-browser", fg="green")
        + click.style(
            "         # Add a new integration without opening the browser\n", fg="black"
        ),
        click.style("composio add <app_name> -i <integration_id>", fg="green")
        + click.style(
            "  # Add a new integration using an existing integration ID\n", fg="black"
        ),
    ]


@click.command(name="add", cls=AddIntegrationExamples)
@click.help_option("--help", "-h", "-help")
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
    help="Specify integration ID to use existing integration",
)
@click.option(
    "-a",
    "--auth-mode",
    type=str.upper,
    help="Specify auth mode for given app.",
    metavar="MODE",
)
@click.option(
    "-s",
    "--scope",
    "scopes",
    type=str,
    help="Specify scopes for the connection.",
    multiple=True,
)
@click.option(
    "--force",
    is_flag=True,
    help="Override the existing account.",
)
@click.option(
    "-l",
    "--label",
    "labels",
    help="Labels for connected account.",
    multiple=True,
)
@pass_entity_id
@handle_exceptions()
@ensure_login
@pass_context
def _add(
    context: Context,
    name: str,
    scopes: t.Tuple[str, ...],
    entity_id: str,
    integration_id: t.Optional[str],
    labels: t.List[str],
    no_browser: bool = False,
    auth_mode: t.Optional[str] = None,
    force: bool = False,
) -> None:
    """Add a new integration."""
    add_integration(
        name=name.lower().strip(),
        context=context,
        entity_id=entity_id,
        integration_id=integration_id,
        no_browser=no_browser,
        auth_mode=auth_mode,
        scopes=scopes,
        force=force,
        labels=list(labels or []),
    )


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
        if field.get("required", False):
            value = input(f"> Enter {field.get('display_name', field.get('name'))}: ")
            if not value:
                raise click.ClickException(
                    f"{field.get('display_name', field.get('name'))} is required"
                )
        else:
            value = input(
                f"> Enter {field.get('display_name', field.get('name'))} (Optional):"
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
    auth_mode: t.Optional[str] = None,
    scopes: t.Optional[t.Tuple[str, ...]] = None,
    labels: t.Optional[t.List] = None,
    force: bool = False,
) -> None:
    """
    Add integration.

    :param name: App name.
    :param context: CLI runtime context.
    :param entity_id: Entity ID to use for creating integration.
    :param no_browser: Don't open browser.
    :param auth_mode: Preferred auth mode.
    :param scopes: List of scopes for the connected account.
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

    if existing_connection is not None and not force:
        context.console.print(
            f"[yellow]Warning: An existing connection for {name} was found.[/yellow]\n"
        )
        if not _replace_connection():
            context.console.print(
                "\n[green]Existing connection retained. No new connection added.[/green]\n"
            )
            return None

    if existing_connection is not None and force:
        context.console.print(
            f"[yellow]Warning: Replacing existing connection for {name}.[/yellow]\n"
        )

    context.console.print(
        f"\n[green]> Adding integration: {name.capitalize()}...[/green]\n"
    )
    app = t.cast(AppModel, context.client.apps.get(name=name))
    if app.no_auth:
        raise click.ClickException(f"{app.name} does not require authentication")

    auth_schemes = app.auth_schemes or []
    if len(auth_schemes) == 0:
        context.console.print(f"{app.name} does not need authentication")
        return None

    auth_modes = {auth_scheme.auth_mode: auth_scheme for auth_scheme in auth_schemes}
    if auth_mode is not None and auth_mode not in auth_modes:
        raise click.ClickException(
            f"Invalid value for `auth_mode`, select from `{set(auth_modes)}`"
        )

    if auth_mode is not None:
        auth_mode = t.cast(AuthSchemeType, auth_mode)
        auth_scheme = auth_modes[auth_mode]
    elif len(auth_modes) == 1:
        ((auth_mode, auth_scheme),) = auth_modes.items()
    else:
        auth_mode = t.cast(
            AuthSchemeType,
            click.prompt(
                "Select auth mode: ",
                type=click.Choice(choices=list(auth_modes)),
            ),
        )
        auth_scheme = auth_modes[auth_mode]

    if auth_mode.lower() in ("basic", "api_key", "bearer_token"):
        return _handle_basic_auth(
            entity=entity,
            app_name=name,
            auth_mode=auth_mode,
            auth_scheme=auth_scheme,
            labels=labels,
        )
    return _handle_oauth(
        entity=entity,
        client=context.client,
        app_name=name,
        auth_scheme=auth_scheme,
        no_browser=no_browser,
        integration=integration,
        scopes=scopes,
        use_composio_auth=len(app.testConnectors or []) != 0,
        labels=labels,
    )


def _handle_oauth(
    entity: Entity,
    client: Composio,
    app_name: str,
    auth_scheme: AppAuthScheme,
    no_browser: bool = False,
    integration: t.Optional[IntegrationModel] = None,
    scopes: t.Optional[t.Tuple[str, ...]] = None,
    labels: t.Optional[t.List] = None,
    use_composio_auth: bool = False,
) -> None:
    """Handle no auth."""
    auth_config = {}
    if not use_composio_auth:
        auth_config.update(
            _collect_input_fields(
                fields=auth_scheme.fields,
            )
        )

    if scopes is not None:
        if auth_config.get("scopes") is not None:
            scopes = tuple(set([*auth_config["scopes"].split(","), *scopes]))
        auth_config["scopes"] = ",".join(scopes)

    connection = entity.initiate_connection(
        app_name=app_name.lower(),
        redirect_url=get_web_url(path="redirect"),
        integration=integration,
        auth_mode="OAUTH2",
        auth_config=auth_config,
        use_composio_auth=use_composio_auth,
        force_new_integration=len(scopes or []) > 0,
        labels=labels,
    )
    if not no_browser:
        webbrowser.open(
            url=str(connection.redirectUrl),
        )
    click.echo(
        f"Please authenticate {app_name} in the browser and come back here. "
        f"URL: {connection.redirectUrl}"
    )
    click.echo(f"⚠ Waiting for {app_name} authentication...")
    connection.wait_until_active(client=client)
    click.echo(
        f"✔ {app_name} added successfully with ID: {connection.connectedAccountId}"
    )


def _handle_basic_auth(
    entity: Entity,
    app_name: str,
    auth_mode: str,
    auth_scheme: AppAuthScheme,
    integration: t.Optional[IntegrationModel] = None,
    labels: t.Optional[t.List] = None,
) -> None:
    """Handle basic auth."""
    auth_config = _collect_input_fields(
        fields=auth_scheme.fields,
    )
    connection = entity.initiate_connection(
        app_name=app_name.lower(),
        auth_mode=auth_mode,
        auth_config=auth_config,
        integration=integration,
        use_composio_auth=False,
        force_new_integration=True,
        labels=labels,
    )
    click.echo(
        f"✔ {app_name} added successfully with ID: {connection.connectedAccountId}"
    )
