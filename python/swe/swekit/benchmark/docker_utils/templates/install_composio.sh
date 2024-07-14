#!/bin/bash
set -e

# Activate the virtual environment
source /opt/composio-venv/bin/activate

# Check the environment variable and install composio-core accordingly
if [ "$COMPOSIO_DEV_MODE" = 1 ]; then
    # Install composio-core in editable mode
    pip install -e /opt/composio-core
else
    # Install composio-core normally
    pip install -U composio-core
fi

# Create a flag file indicating that the script has finished
touch /tmp/entrypoint_complete

# Execute the command passed to the entrypoint
exec "$@"
