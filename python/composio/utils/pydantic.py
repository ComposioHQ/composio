import typing as t

import pydantic
import pydantic.v1.error_wrappers


def parse_pydantic_error(
    e: t.Union[pydantic.ValidationError, pydantic.v1.error_wrappers.ValidationError]
) -> str:
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
