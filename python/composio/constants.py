"""
Global constants for Composio SDK
"""

from pathlib import Path


ENV_COMPOSIO_API_KEY = "COMPOSIO_API_KEY"
"""
Environment variable for Composio API key
"""

ENV_COMPOSIO_LOGGING_LEVEL = "COMPOSIO_LOGGING_LEVEL"
"""
Environment variable for specifying logging level
"""

LOCAL_CACHE_DIRECTORY_NAME = ".composio"
"""
Local cache directory name for composio CLI
"""

LOCAL_CACHE_DIRECTORY = Path.home() / LOCAL_CACHE_DIRECTORY_NAME
"""
Path to local caching directory.
"""

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
