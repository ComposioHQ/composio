"""
Composio CLI Tool.
"""

import click

from composio.cli.actions import _actions
from composio.cli.add import _add
from composio.cli.apps import _apps
from composio.cli.connections import _connections
from composio.cli.integrations import _integrations
from composio.cli.login import _login
from composio.cli.logout import _logout
from composio.cli.triggers import _triggers
from composio.cli.utils import HelpfulCmdBase
from composio.cli.whoami import _whoami
from composio.core.cls.catch_all_exceptions import (
    CatchAllExceptions,
    handle_exceptions,
    init_sentry,
)
from composio.core.cls.did_you_mean import DYMGroup


init_sentry()


class HelpDYMGroup(DYMGroup):
    def format_help(self, ctx, formatter):
        formatter.write("\n")

        super().format_help(ctx, formatter)

        formatter.write("\n📙 Examples:\n\n")

        formatter.write(
            click.style("composio --help", fg="green")
            + click.style("          # Display help information\n", fg="black")
        )
        formatter.write(
            click.style("composio add github", fg="green")
            + click.style("      # Add an integration to your account\n", fg="black")
        )
        formatter.write(
            click.style("composio login", fg="green")
            + click.style("           # Log in to your Composio account\n", fg="black")
        )


@click.group(
    name="composio", cls=CatchAllExceptions(HelpDYMGroup, handler=handle_exceptions)
)
@click.help_option("--help", "-h", "-help")
def composio() -> None:
    """
    🔗 Composio CLI Tool.
    """


composio.add_command(_add)
composio.add_command(_apps)
composio.add_command(_login)
composio.add_command(_logout)
composio.add_command(_whoami)
composio.add_command(_actions)
composio.add_command(_triggers)
composio.add_command(_integrations)
composio.add_command(_connections)
