#!/bin/bash
set -e

# Activate the virtual environment
source /opt/composio-venv/bin/activate

# Check the environment variable and install composio-core accordingly
if [ "$ENV" = "dev" ]; then
    # Install composio-core in editable mode
    pip install -e /opt/composio-core
else
    # Install composio-core normally
    pip install -U composio-core
fi

# Execute the command passed to the entrypoint
exec "$@"
