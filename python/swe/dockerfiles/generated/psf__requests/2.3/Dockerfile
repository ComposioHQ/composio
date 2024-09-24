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
RUN git fetch --depth 1 origin 3c88e520da24ae6f736929a750876e7654accc3d

# Checkout to base commit
RUN git checkout 3c88e520da24ae6f736929a750876e7654accc3d

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/requests
COPY fqdn_cache.json /home/user/.composio/tmp/requests

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "pytest" || echo "$?"

WORKDIR /home/user/requests

# Install package
RUN /home/user/.dev/bin/python -m pip install . || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root