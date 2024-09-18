FROM composio/swe:py3.9

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/sphinx && git clone --depth 1 https://github.com/sphinx-doc/sphinx

# Set repository as workdir
WORKDIR /home/user/sphinx

# Fetch the base commit
RUN git fetch --depth 1 origin f35d2a6cc726f97d0e859ca7a0e1729f7da8a6c8

# Checkout to base commit
RUN git checkout f35d2a6cc726f97d0e859ca7a0e1729f7da8a6c8

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/sphinx
COPY fqdn_cache.json /home/user/.composio/tmp/sphinx

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "tox" || echo "$?"

WORKDIR /home/user/sphinx

# Pre install
RUN sed -i 's/pytest/pytest -rA/' tox.ini

# Install package
RUN /home/user/.dev/bin/python -m pip install -e .[test] || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root