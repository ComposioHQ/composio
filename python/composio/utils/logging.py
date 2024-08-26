"""
Logging utilities.
"""

import logging
import os
import typing as t
from enum import Enum

from composio.constants import ENV_COMPOSIO_LOGGING_LEVEL


_DEFAULT_FORMAT = "[%(asctime)s][%(levelname)s] %(message)s"
_DEFAULT_LOGGER_NAME = "composio"


_logger: t.Optional[logging.Logger] = None
"""Global logger object for composio."""


class LogLevel(Enum):
    """Logging level."""

    CRITICAL = "critical"
    FATAL = "fatal"
    ERROR = "error"
    WARNING = "warning"
    WARN = "warn"
    INFO = "info"
    DEBUG = "debug"
    NOTSET = "notset"


_LEVELS: t.Dict[LogLevel, int] = {
    LogLevel.CRITICAL: logging.CRITICAL,
    LogLevel.FATAL: logging.FATAL,
    LogLevel.ERROR: logging.ERROR,
    LogLevel.WARNING: logging.WARNING,
    LogLevel.WARN: logging.WARN,
    LogLevel.INFO: logging.INFO,
    LogLevel.DEBUG: logging.DEBUG,
    LogLevel.NOTSET: logging.NOTSET,
}


def _parse_log_level_from_env(default: int) -> int:
    """Parse log level from environent."""
    level = os.environ.get(ENV_COMPOSIO_LOGGING_LEVEL)
    if level is None:
        return default

    try:
        return _LEVELS[LogLevel(level)]
    except (ValueError, KeyError):
        return default


def setup(
    level: LogLevel = LogLevel.INFO,
    log_format: str = _DEFAULT_FORMAT,
) -> None:
    """Setup logging config."""
    global _logger
    if _logger is None:
        _logger = get(name=_DEFAULT_LOGGER_NAME)

    logging.basicConfig(format=log_format)
    _logger.setLevel(_LEVELS[level])


def get(
    name: t.Optional[str] = None,
    level: LogLevel = LogLevel.INFO,
    log_format: str = _DEFAULT_FORMAT,
) -> logging.Logger:
    """Set up the logger."""
    global _logger
    if _logger is not None:
        return t.cast(logging.Logger, _logger)

    # Setup logging format.
    logging.basicConfig(format=log_format)

    # Create logger
    _logger = logging.getLogger(name or _DEFAULT_LOGGER_NAME)
    _logger.setLevel(_parse_log_level_from_env(default=_LEVELS[level]))
    return _logger


class WithLogger:
    """Interface to endow subclasses with a logger."""

    def __init__(
        self,
        logger: t.Optional[logging.Logger] = None,
        logger_name: str = _DEFAULT_LOGGER_NAME,
        logging_level: LogLevel = LogLevel.INFO,
    ) -> None:
        """
        Initialize the logger.

        :param logger: the logger object.
        :param logger_name: the default logger name, if a logger is not provided.
        """
        self._logger = logger or get(
            name=logger_name,
            level=logging_level,
        )
        self._logging_level = logging._levelToName[self._logger.level]

    @property
    def logger(self) -> logging.Logger:
        """Get the component logger."""
        return t.cast(logging.Logger, self._logger)


get_logger = get
