import os
from pathlib import Path


# TMP_FOLDER_FOR_PYTHON = "./tmp"
TMP_FOLDER_FOR_PYTHON = os.path.join(Path.home(), ".composio")
DIR_FOR_FQDN_CACHE = os.path.join(TMP_FOLDER_FOR_PYTHON, "FQDN_CACHE")
DIR_FOR_TOOL_INFO_CACHE = os.path.join(TMP_FOLDER_FOR_PYTHON, "TOOL_INFO_CACHE")
