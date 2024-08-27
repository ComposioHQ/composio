"""
Composio CLI Tool.
"""

import typing as t

import click

from composio import __version__
from composio.cli.actions import _actions
from composio.cli.add import _add
from composio.cli.apps import _apps
from composio.cli.connections import _connections
from composio.cli.execute import _execute
from composio.cli.integrations import _integrations
from composio.cli.login import _login
from composio.cli.logout import _logout
from composio.cli.serve import _serve
from composio.cli.triggers import _triggers
from composio.cli.utils.params import EnumParam
from composio.cli.whoami import _whoami
from composio.core.cls.catch_all_exceptions import CatchAllExceptions, handle_exceptions
from composio.core.cls.did_you_mean import DYMGroup
from composio.utils import logging


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
    name="composio",
    cls=CatchAllExceptions(
        HelpDYMGroup,
        handler=handle_exceptions,
    ),
)
@click.help_option(
    "-h",
    "-help",
    "--help",
)
@click.version_option(
    version=__version__,
)
@click.option(
    "-v",
    "level",
    help="Specify logging verbosity level.",
    type=EnumParam(cls=logging.LogLevel),
)
def composio(level: t.Optional[logging.LogLevel] = None) -> None:
    """
    🔗 Composio CLI Tool.
    """
    if level is not None:
        logging.setup(level=level)


composio.add_command(_add)
composio.add_command(_apps)
composio.add_command(_login)
composio.add_command(_logout)
composio.add_command(_whoami)
composio.add_command(_actions)
composio.add_command(_triggers)
composio.add_command(_integrations)
composio.add_command(_connections)
composio.add_command(_execute)
composio.add_command(_serve)
