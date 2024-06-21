"""
Custom click flags.
"""

import typing as t
from enum import Enum

import click


class EnumParam(click.ParamType):
    """Enum as click param."""

    def __init__(self, cls: t.Type[Enum]) -> None:
        """Initialize"""
        self.cls = cls

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
