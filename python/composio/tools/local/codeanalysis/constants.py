import os
from pathlib import Path


CODE_MAP_CACHE = os.path.join(Path.home(), ".composio/tmp")
FQDN_FILE = "fqdn_cache.json"
DEEPLAKE_FOLDER = "deeplake"
EMBEDDER = "sentence-transformers/all-mpnet-base-v2"
