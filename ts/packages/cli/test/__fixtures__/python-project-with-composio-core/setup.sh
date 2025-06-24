#!/bin/bash

set -e -o pipefail

# uv init

uv venv
source .venv/bin/activate
uv pip install --requirements requirements.txt;

uv run --active python -c "import composio; print (composio.__file__)"

# deactivate
