import typing as t

import pydantic

from composio.client.compat import OMIT


def none_to_omit(value: t.Optional[t.Any]) -> t.Any:
    """Convert None to the OMIT sentinel for generated-client API calls.

    This utility function helps convert Python's None values to the SDK's OMIT
    sentinel value, which tells the client to exclude the parameter entirely.

    Args:
        value: Any value that might be None

    Returns:
        The original value if not None, otherwise OMIT

    Example:
        >>> none_to_omit("hello")
        "hello"
        >>> none_to_omit(None)
        OMIT
        >>> none_to_omit(42)
        42
    """
    return OMIT if value is None else value


def parse_pydantic_error(e: pydantic.ValidationError) -> str:
    """Parse pydantic validation error."""
    message = "Invalid request data provided"
    missing = []
    others = [""]
    for error in e.errors():
        param = ".".join(map(str, error["loc"]))
        if error["type"] == "missing":
            missing.append(param)
            continue
        others.append(error["msg"] + f" on parameter `{param}`")
    if len(missing) > 0:
        message += f"\n- Following fields are missing: {set(missing)}"
    message += "\n- ".join(others)
    return message
