import logging

from rich.logging import RichHandler


def get_logger(logger_name):
    handler = RichHandler(show_time=False, show_path=False)
    handler.setLevel(logging.DEBUG)
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.DEBUG)
    logger.addHandler(handler)
    logger.propagate = False
    return logger
