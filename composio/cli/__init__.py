"""
Composio CLI Tool.
"""

import click

from composio.cli.apps import _apps
from composio.cli.integrations import _integrations
from composio.cli.login import _login
from composio.cli.triggers import _triggers


@click.group(name="composio")
def composio() -> None:
    """
    Composio CLI Tool.
    """


composio.add_command(_login)
composio.add_command(_apps)
composio.add_command(_triggers)
composio.add_command(_integrations)
