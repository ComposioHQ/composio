"""
Integrations manager for Composio SDK.

Usage:
    composio integrations [command] [options]
"""

import click

from composio.cli.context import Context, login_required, pass_context
from composio.cli.utils.decorators import handle_exceptions
from composio.cli.utils.helpfulcmd import HelpfulCmdBase
from composio.core.cls.did_you_mean import DYMGroup


class IntegrationsExamples(HelpfulCmdBase, DYMGroup):
    examples = [
        click.style("composio integrations", fg="green")
        + click.style(
            "                                # List all integrations\n", fg="black"
        ),
        click.style("composio integrations add --name GitHub", fg="green")
        + click.style(
            "              # Add a new integration named GitHub\n", fg="black"
        ),
        click.style("composio integrations remove --id 123", fg="green")
        + click.style("                # Remove integration with ID 123\n", fg="black"),
        click.style("composio integrations update --id 456 --name GitLab", fg="green")
        + click.style(
            "  # Update integration with ID 456 to name GitLab\n", fg="black"
        ),
    ]


@click.group(name="integrations", invoke_without_command=True, cls=IntegrationsExamples)
@click.help_option("--help", "-h", "-help")
@handle_exceptions()
@login_required
@pass_context
def _integrations(context: Context) -> None:
    """List composio integrations for your account"""
    if context.click_ctx.invoked_subcommand:
        return

    integrations = context.client.integrations.get()
    context.console.print("[green]Showing integrations[/green]")
    for integration in integrations:
        context.console.print(f"• App: {integration.appName}")
        context.console.print(f"  ID: {integration.id}")
