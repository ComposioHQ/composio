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
RUN git fetch --depth 1 origin ac2b7599d212af7d04649959ce6926c63c3133fa

# Checkout to base commit
RUN git checkout ac2b7599d212af7d04649959ce6926c63c3133fa

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/sphinx
COPY fqdn_cache.json /home/user/.composio/tmp/sphinx

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "tox" || echo "$?"

WORKDIR /home/user/sphinx

# Pre install
RUN sed -i 's/pytest/pytest -rA/' tox.ini

RUN git add -u
RUN git config --global user.email "example@example.com"
RUN git config --global user.name "composio"
RUN git commit -m "fix: setup complete"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e .[test] || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root