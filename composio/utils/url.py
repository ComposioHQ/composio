"""
URL utilities.
"""

import os

from composio.constants import (
    BASE_URL_TO_PROD_MAPPING,
    DEFAULT_BASE_URL,
    ENV_COMPOSIO_BASE_URL,
)


def get_api_url_base() -> str:
    """Get URL for composio API Server."""
    return os.environ.get(
        ENV_COMPOSIO_BASE_URL,
        DEFAULT_BASE_URL,
    )


def get_web_url(path: str) -> str:
    """Get URL for the Composio web app."""
    base_url = get_api_url_base()
    web_url = BASE_URL_TO_PROD_MAPPING.get(base_url)
    if web_url is None:
        raise ValueError(
            f"Incorrect format for base_url: {base_url}. "
            "Format should be on of follwing {"
            "https://backend.composio.dev/api, "
            "https://hermes-development.up.railway.app/api, "
            "http://localhost:9900/api"
            "}"
        )
    return f"{web_url}/{path}"
