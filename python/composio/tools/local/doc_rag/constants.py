from composio.constants import LOCAL_CACHE_DIRECTORY

INDEX_CACHE = str(LOCAL_CACHE_DIRECTORY / "tmp")
INDEX_FILE = "index.json"
DEEPLAKE_FOLDER = "deeplake"
EMBEDDER = "sentence-transformers/all-mpnet-base-v2"

CHUNK_SIZE = 512
CHUNK_OVERLAP = 64
TOP_K = 5