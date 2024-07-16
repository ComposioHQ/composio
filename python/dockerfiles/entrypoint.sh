#!/bin/bash

# UUID Generator
uuid(){
    /bin/python3 -c 'import uuid; print (uuid.uuid4().hex.replace("-", ""))'
}

# Setup composio logging level
export COMPOSIO_LOGGING_LEVEL=debug

# TOFIX: Do not use random user everytime
# Setup credentials
export _SSH_USERNAME=$(uuid)
export _SSH_PASSWORD=$(uuid)

# Setup user
sudo useradd -rm -d /home/$_SSH_USERNAME -s /bin/bash -g root -G sudo -u 1000 $_SSH_USERNAME

# Setup password
echo $_SSH_USERNAME:$_SSH_PASSWORD | sudo chpasswd

# Start SSH Server
service ssh restart

# Install composio in dev mode if `COMPOSIO_DEV_MODE` is set to 1
if [ "$COMPOSIO_DEV_MODE" = 1 ]; then
    # Install composio-core in editable mode
    pip install -e /opt/composio-core
fi


# Update apps
composio apps update

# Start tooling server
composio serve -h "0.0.0.0" -p 8000
