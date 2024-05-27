"""
Integrations manager for Composio SDK.

Usage:
    composio integrations [command] [options]
"""

import webbrowser

import click
from beaupy.spinners import DOTS, Spinner

from composio.cli.context import Context, login_required, pass_context
from composio.client.enums import Action
from composio.client.exceptions import ComposioClientError
from composio.exceptions import ComposioSDKError
from composio.utils.url import get_web_url


@click.group(name="integrations", invoke_without_command=True)
@pass_context
def _integrations(context: Context) -> None:
    """Manage composio integrations"""
    if context.click_ctx.invoked_subcommand:
        return

    try:
        integrations = context.client.integrations.get()
        context.console.print("[green]Showing integrations[/green]")
        for integration in integrations:
            context.console.print(f"• App: {integration.appName}")
            context.console.print(f"  ID : {integration.id}")
    except ComposioSDKError as e:
        raise click.ClickException(message=e.message) from e


@_integrations.command(name="add")
@click.argument("name", type=str)
@click.option(
    "--no-browser",
    is_flag=True,
    default=False,
    help="Don't open browser for verifying connection",
)
@login_required
@pass_context
def _add(  # pylint: disable=too-many-locals,too-many-nested-blocks
    context: Context,
    name: str,
    no_browser: bool = False,
) -> None:
    """Add a new integration"""

    try:
        entity = context.client.get_entity()
        try:
            existing_connection = entity.get_connection(
                action=Action.from_app(
                    name=name,
                )
            )
        except ComposioClientError:
            existing_connection = None

        if existing_connection is not None:
            context.console.print(
                f"[yellow]Warning: An existing connection for {name} was found.[/yellow]\n"
            )
            replace_connection = click.prompt(
                "> Do you want to replace the existing connection?",
                type=click.Choice(
                    choices=("y", "n"),
                    case_sensitive=False,
                ),
            )
            if replace_connection == "n":
                context.console.print(
                    "\n[green]Existing connection retained. No new connection added.[/green]\n"
                )
                return

            context.console.print(
                f"\n[green]> Adding integration: {name.capitalize()}...[/green]\n"
            )
            app = context.client.apps.get(name=name)
            auth_schemes = app.auth_schemes or []
            auth_modes = [auth_scheme.auth_mode for auth_scheme in auth_schemes]
            if len(auth_modes) > 0 and auth_modes[0] in [
                "API_KEY",
                "BASIC",
                "SNOWFLAKE",
            ]:
                connection = entity.initiate_connection(
                    app_name=name.lower(),
                    auth_mode=auth_modes[0],
                )
                fields = auth_schemes[0].fields
                field_inputs = {}
                for _field in fields:
                    field = _field.model_dump()
                    if field.get("expected_from_customer", True):
                        if field.get("required", False):
                            value = field.get("default") or input(
                                f"> Enter {field.get('displayName', field.get('name'))}: "
                            )
                            if (
                                not value
                            ):  # If a required field is not provided and no default is available
                                raise click.ClickException(
                                    f"{field.get('displayName', field.get('name'))} is required"
                                )
                        else:
                            context.console.print(
                                f"[green]> Enter {field.get('displayName', field.get('name'))} (Optional): [/green]",
                                end="",
                            )
                            value = input() or field.get("default")
                        field_inputs[field.get("name")] = value
                connection.save_user_access_data(
                    client=context.client,
                    field_inputs=field_inputs,
                    entity_id=entity.id,
                )
        else:
            connection = entity.initiate_connection(
                app_name=name,
                redirect_url=get_web_url(path="redirect"),
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
    except ComposioSDKError as e:
        raise click.ClickException(
            message=e.message,
        ) from e
