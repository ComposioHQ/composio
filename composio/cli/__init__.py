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
from composio.cli.whoami import _whoami


@click.group(name="composio")
def composio() -> None:
    """
    Composio CLI Tool.
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
