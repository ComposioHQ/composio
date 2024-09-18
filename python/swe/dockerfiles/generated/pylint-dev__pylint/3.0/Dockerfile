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
RUN git fetch --depth 1 origin 1f8c4d9eb185c16a2c1d881c054f015e1c2eb334

# Checkout to base commit
RUN git checkout 1f8c4d9eb185c16a2c1d881c054f015e1c2eb334

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/pylint/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/pylint

# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "astroid==3.0.0a6" || echo "$?"

# Install dependecies
COPY requirements.txt _requirements.txt

# Install from requirements.txt
RUN /home/user/.dev/bin/python -m pip install -r _requirements.txt || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/pylint

# Switch to root
USER root