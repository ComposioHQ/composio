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
RUN git fetch --depth 1 origin 58e6a09db49f34886ff13f3b7520dd0bcd7063cd

# Checkout to base commit
RUN git checkout 58e6a09db49f34886ff13f3b7520dd0bcd7063cd

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/pytest/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/pytest

# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "atomicwrites==1.4.1" "attrs==23.1.0" "more-itertools==10.1.0" "pluggy==0.11.0" "py==1.11.0" "setuptools==68.0.0" "six==1.16.0" "wcwidth==0.2.6" || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/pytest

# Switch to root
USER root