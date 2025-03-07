"""
Helper utilities.
"""

import sys

from .enums import get_enum_key


def blue(message: str) -> str:
    return f"\033[36m{message}\033[0m"


def green(message: str) -> str:
    return f"\033[32m{message}\033[0m"


help_msg_already_printed = False


def help_msg() -> str:
    global help_msg_already_printed
    if help_msg_already_printed:
        return ""

    help_msg_already_printed = True
    if sys.stdout.isatty():
        return (
            blue("Give Feedback / Get Help:\n")
            + blue("    On GitHub: ")
            + "https://github.com/ComposioHQ/composio/issues/new\n"
            + blue("    On Discord: ")
            + "https://dub.composio.dev/discord\n"
            + blue("    On Email: ")
            + "tech@composio.dev\n"
            + blue("    Talk to us on Intercom: ")
            + "https://composio.dev\n"
            + blue("    Book a call with us: ")
            + "https://composio.dev/redirect?url=https://calendly.com/composiohq/support?utm_source=py-sdk-logs&utm_campaign=calendly\n"
            + "If you need to debug this error, "
            + green("set `COMPOSIO_LOGGING_LEVEL=debug`")
            + "."
        )

    return (
        "Give Feedback / Get Help:\n"
        "    On GitHub: https://github.com/ComposioHQ/composio/issues/new\n"
        "    On Discord: https://dub.composio.dev/discord\n"
        "    On Email: tech@composio.dev\n"
        "    Talk to us on Intercom: https://composio.dev\n"
        "    Book a call with us: https://composio.dev/redirect?url=https://calendly.com/composiohq/support?utm_source=py-sdk-logs&utm_campaign=calendly\n"
        "If you need to debug this error, set `COMPOSIO_LOGGING_LEVEL=debug`."
    )
