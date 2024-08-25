"""
Common decorators for CLI commands.
"""

import traceback
import typing as t

import click
import typing_extensions as te

from composio.constants import DEFAULT_ENTITY_ID
from composio.exceptions import ComposioSDKError
from composio.utils.logging import get as get_logger


class ExceptionConfig(te.TypedDict):
    cls: t.Type[Exception]
    message: str


pass_entity_id = click.option(
    "-e",
    "--entity-id",
    help="Specify entity ID for creating the integration",
    type=str,
    default=DEFAULT_ENTITY_ID,
)


def handle_exceptions(*exceptions: ExceptionConfig):
    logger = get_logger()

    def wrap(f):
        def wrapper(*args, **kwargs):
            try:
                return f(*args, **kwargs)
            except ComposioSDKError as e:
                logger.debug(traceback.format_exc())
                raise click.ClickException(e.message)
            except Exception as e:
                for exception in exceptions:
                    if isinstance(e, exception["cls"]):
                        logger.debug(traceback.format_exc())
                        raise click.ClickException(exception["message"])
                raise

        return wrapper

    return wrap
