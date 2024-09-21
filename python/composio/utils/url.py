"""
URL utilities.
"""

import os

from composio.constants import (
    BASE_URL_LOCAL,
    BASE_URL_PROD,
    BASE_URL_STAGING,
    BASE_URL_TO_PROD_MAPPING,
    DEFAULT_BASE_URL,
    ENV_COMPOSIO_BASE_URL,
)


def get_api_url_base() -> str:
    """Get URL for composio API Server."""
    return os.environ.get(ENV_COMPOSIO_BASE_URL) or DEFAULT_BASE_URL


def get_web_url(path: str) -> str:
    """Get URL for the Composio web app."""
    base_url = get_api_url_base()
    web_url = BASE_URL_TO_PROD_MAPPING.get(base_url)
    if web_url is None:
        raise ValueError(
            f"Incorrect format for base_url: {base_url}. "
            "Format should be on of following {"
            f"{BASE_URL_PROD}, "
            f"{BASE_URL_STAGING}, "
            f"{BASE_URL_LOCAL}"
            "}"
        )
    return f"{web_url}/{path}"
