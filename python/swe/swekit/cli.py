"""CLI for SWE Kit."""

import typing as t
from pathlib import Path

import click
from swekit.exceptions import SWEKitError
from swekit.scaffold import AgenticFramework, scaffold

from composio.cli.utils.params import EnumParam, PathParam


@click.group(name="swekit")
def swekit() -> None:
    """Composio Coder CLI for managing the coding workspace and tasks."""


@swekit.command(name="scaffold")
@click.argument("framework", type=EnumParam(cls=AgenticFramework))
@click.option(
    "-n",
    "--name",
    type=str,
    help="Name of agent",
)
@click.option(
    "-o",
    "--outdir",
    type=PathParam(),
    help="Output directory for the agent",
)
@click.help_option("--help")
def _scaffold(
    framework: AgenticFramework,
    name: t.Optional[str] = None,
    outdir: t.Optional[Path] = None,
) -> None:
    """🤖 Scaffold agent using composio toolset."""
    try:
        output = scaffold(
            framework=framework,
            name=name,
            outdir=outdir,
        )
        click.echo(f"🤖 Scaffolded agent @ {output}")
    except SWEKitError as e:
        raise click.ClickException(str(e)) from e


if __name__ == "__main__":
    swekit()
