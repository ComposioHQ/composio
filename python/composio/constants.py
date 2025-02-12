"""
Global constants for Composio SDK
"""

import os
from pathlib import Path


ENV_COMPOSIO_API_KEY = "COMPOSIO_API_KEY"
"""
Environment variable for Composio API key
"""

ENV_COMPOSIO_LOGGING_LEVEL = "COMPOSIO_LOGGING_LEVEL"
"""
Environment variable for specifying logging level
"""

ENV_COMPOSIO_VERSIONING_POLICY = "COMPOSIO_VERSIONING_POLICY"
"""
Environment variable for specifying default versioning policy.
"""

LOCAL_CACHE_DIRECTORY_NAME = ".composio"
"""
Local cache directory name for composio CLI
"""

LOCAL_CACHE_DIRECTORY_NAME = ".composio"
"""
Local cache directory name for composio CLI
"""

ENV_LOCAL_CACHE_DIRECTORY = "COMPOSIO_CACHE_DIR"
"""
Environment to set the composio caching directory.
"""

_cache_dir = os.environ.get(ENV_LOCAL_CACHE_DIRECTORY)

LOCAL_CACHE_DIRECTORY = (
    Path(_cache_dir)
    if _cache_dir is not None
    else (Path.home() / LOCAL_CACHE_DIRECTORY_NAME)
)
"""
Path to local caching directory.
"""

try:
    LOCAL_CACHE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    if not os.access(LOCAL_CACHE_DIRECTORY, os.W_OK):
        raise OSError
except OSError as e:
    raise RuntimeError(
        f"Cache directory {LOCAL_CACHE_DIRECTORY} is not writable please "
        f"provide a path that is writable using {ENV_LOCAL_CACHE_DIRECTORY} "
        "environment variable."
    ) from e


LOCAL_OUTPUT_FILE_DIRECTORY_NAME = "output"
"""
Local output file directory name for composio tools
"""

USER_DATA_FILE_NAME = "user_data.json"
"""
Filename for storing user data.
"""

DEFAULT_ENTITY_ID = "default"
"""
Default entity ID value.
"""

DEFAULT_BASE_URL = "https://backend.composio.dev/api"
"""
Base URL for composio API server.
"""

ENV_COMPOSIO_BASE_URL = "COMPOSIO_BASE_URL"
"""
Environment variable for Composio API server base URL
"""

BASE_URL_PROD = "https://backend.composio.dev/api"
"""
Base URL for production server.
"""

WEB_URL_PROD = "https://app.composio.dev"
"""
Web URL for production server.
"""

BASE_URL_STAGING = "https://staging-backend.composio.dev/api"
"""
Base URL for staging server.
"""

WEB_URL_STAGING = "https://hermes-frontend-git-master-composio.vercel.app"
"""
Web URL for staging server.
"""

BASE_URL_LOCAL = "http://localhost:9900/api"
"""
Base URL for local server.
"""

WEB_URL_LOCAL = "http://localhost:3000"
"""
Web URL for local server.
"""

BASE_URL_TO_PROD_MAPPING = {
    BASE_URL_PROD: WEB_URL_PROD,
    BASE_URL_STAGING: WEB_URL_STAGING,
    BASE_URL_LOCAL: WEB_URL_LOCAL,
}
"""
Composio API server base url -> web url mappings.
"""

PUSHER_KEY = "ff9f18c208855d77a152"
"""
API Key for Pusher subscriptions.
"""

PUSHER_CLUSTER = "mt1"
"""
Name of the pusher cluster.
"""

LOCKFILE_PATH = Path("./.composio.lock")
"""
Path to the .composio.lock file.
"""

VERSION_LATEST = "latest"
"""Latest version specifier."""

VERSION_LATEST_BASE = "latest:base"
"""Latest none-breaking version specifier."""

COMPOSIO_VERSIONING_POLICY = os.environ.get(
    ENV_COMPOSIO_VERSIONING_POLICY,
    VERSION_LATEST_BASE,
)
