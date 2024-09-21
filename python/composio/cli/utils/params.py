"""
Custom click flags.
"""

import typing as t
from enum import Enum
from pathlib import Path

import click


class EnumParam(click.ParamType):
    """Enum as click param."""

    def __init__(self, cls: t.Type[Enum]) -> None:
        """Initialize"""
        self.cls = cls

    def get_metavar(self, param: click.Parameter) -> str:
        """Get metavar representation."""
        return t.cast(str, param.name).upper()

    def convert(
        self,
        value: str,
        param: t.Optional[click.Parameter] = None,
        ctx: t.Optional[click.Context] = None,  # pylint: disable=unused-argument
    ) -> Enum:
        """Convert to ledger id."""
        try:
            return self.cls(value)
        except ValueError as e:
            raise click.ClickException(
                f"Option `{value}` is invalid for `{'/'.join(t.cast(click.Parameter, param).opts)}` "
                f"please provide one of {set(map(lambda x:x.value, self.cls))} as value"
            ) from e


class PathParam(click.Path):
    """Path as click param."""

    def convert(  # type: ignore
        self,
        value: str,
        param: t.Optional[click.Parameter] = None,
        ctx: t.Optional[click.Context] = None,
    ) -> Path:
        """Convert to ledger id."""
        return Path(str(super().convert(value=value, param=param, ctx=ctx)))
