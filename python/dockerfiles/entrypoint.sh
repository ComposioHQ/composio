#!/bin/bash

# Setup composio logging level
export COMPOSIO_LOGGING_LEVEL=debug

# Setup credentials
export PASSWORD=$(openssl rand -hex 16)

# Setup user
cd /home/user

# Setup password
echo user:$PASSWORD | sudo chpasswd

# Start SSH Server
service ssh restart

# Install composio in dev mode if `COMPOSIO_DEV_MODE` is set to 1
if [ "$COMPOSIO_DEV_MODE" = 1 ]; then
    # Install composio-core in editable mode
    pip install -e /opt/composio-core[all]
fi

# Update apps
composio apps update

# Setup SSH creds
export _SSH_USERNAME=user && export _SSH_PASSWORD=$PASSWORD

# Start tooling server
composio serve -h "0.0.0.0" -p 8000
