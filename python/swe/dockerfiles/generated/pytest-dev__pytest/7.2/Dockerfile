FROM composio/swe:py3.9

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/pytest && git clone --depth 1 https://github.com/pytest-dev/pytest

# Set repository as workdir
WORKDIR /home/user/pytest

# Fetch the base commit
RUN git fetch --depth 1 origin aa55975c7d3f6c9f6d7f68accc41bb7cadf0eb9a

# Checkout to base commit
RUN git checkout aa55975c7d3f6c9f6d7f68accc41bb7cadf0eb9a

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/pytest/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/pytest

# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "attrs==23.1.0" "iniconfig==2.0.0" "packaging==23.1" "pluggy==0.13.1" "py==1.11.0" "tomli==2.0.1" || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/pytest

# Switch to root
USER root