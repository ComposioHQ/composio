"""Serve the tooling server."""

import click
from uvicorn import run


@click.command(name="serve")
@click.option(
    "-h",
    "--host",
    type=str,
    help="Specify host string",
    default="localhost",
)
@click.option(
    "-p",
    "--port",
    type=int,
    help="Specify port number",
    default=8000,
)
def _serve(host: str, port: int) -> None:
    """Start the tooling server"""
    from composio.server.api import (  # pylint: disable=import-outside-toplevel
        create_app,
    )

    run(
        app=create_app(),
        host=host,
        port=port,
    )
