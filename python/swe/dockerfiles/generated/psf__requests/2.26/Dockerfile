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
RUN git fetch --depth 1 origin 39d0fdd9096f7dceccbc8f82e1eda7dd64717a8e

# Checkout to base commit
RUN git checkout 39d0fdd9096f7dceccbc8f82e1eda7dd64717a8e

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