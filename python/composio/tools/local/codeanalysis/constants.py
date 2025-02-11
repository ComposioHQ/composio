import os
from pathlib import Path

from composio.constants import LOCAL_CACHE_DIRECTORY


CODE_MAP_CACHE = os.path.join(LOCAL_CACHE_DIRECTORY, "tmp")
FQDN_FILE = "fqdn_cache.json"
DEEPLAKE_FOLDER = "deeplake"
EMBEDDER = "sentence-transformers/all-mpnet-base-v2"
