FROM composio/swe:py3.9

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/pylint && git clone --depth 1 https://github.com/pylint-dev/pylint

# Set repository as workdir
WORKDIR /home/user/pylint

# Fetch the base commit
RUN git fetch --depth 1 origin 754b487f4d892e3d4872b6fc7468a71db4e31c13

# Checkout to base commit
RUN git checkout 754b487f4d892e3d4872b6fc7468a71db4e31c13

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/pylint
COPY fqdn_cache.json /home/user/.composio/tmp/pylint

# Install dependencies
COPY requirements.txt _requirements.txt

# Install from requirements.txt
RUN /home/user/.dev/bin/python -m pip install -r _requirements.txt || echo "$?"

WORKDIR /home/user/pylint

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root