"""
Function decorators.
"""

import typing as t
import warnings

import typing_extensions as te

from composio.utils import help_msg


T = te.TypeVar("T")
P = te.ParamSpec("P")


def deprecated(
    version: str,
    replacement: str,
) -> t.Callable[[t.Callable[P, T]], t.Callable[P, T]]:
    """
    Mark a function as deprecated.

    :param version: Version where this method will be deprecated.
    :param replacement: Replacement for this method.
    """

    def wrapper(func: t.Callable[P, T]) -> t.Callable[P, T]:
        def new_func(*args: P.args, **kwargs: P.kwargs) -> T:
            warnings.warn(
                f"`{func.__name__}` is deprecated and will be removed on v{version}. "
                f"Use `{replacement}` method instead." + help_msg(),
                UserWarning,
            )
            return func(*args, **kwargs)

        return new_func

    return wrapper
