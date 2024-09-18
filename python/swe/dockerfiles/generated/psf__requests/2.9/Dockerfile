FROM composio/swe:py3.9

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/requests && git clone --depth 1 https://github.com/psf/requests

# Set repository as workdir
WORKDIR /home/user/requests

# Fetch the base commit
RUN git fetch --depth 1 origin 5f7a3a74aab1625c2bb65f643197ee885e3da576

# Checkout to base commit
RUN git checkout 5f7a3a74aab1625c2bb65f643197ee885e3da576

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/requests/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/requests

# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "pytest" || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install . || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/requests

# Switch to root
USER root