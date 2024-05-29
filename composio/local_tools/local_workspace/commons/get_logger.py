import logging

from rich.logging import RichHandler


LOGGER_NAME = "local_workspace"

handler = RichHandler(show_time=False, show_path=False)
handler.setLevel(logging.DEBUG)
logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.propagate = False


def get_logger():
    return logger
