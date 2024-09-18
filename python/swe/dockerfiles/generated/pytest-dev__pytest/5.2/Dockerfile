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
RUN git fetch --depth 1 origin e856638ba086fcf5bebf1bebea32d5cf78de87b4

# Checkout to base commit
RUN git checkout e856638ba086fcf5bebf1bebea32d5cf78de87b4

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/pytest/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/pytest

# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "atomicwrites==1.4.1" "attrs==23.1.0" "more-itertools==10.1.0" "packaging==23.1" "pluggy==0.13.1" "py==1.11.0" "wcwidth==0.2.6" || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/pytest

# Switch to root
USER root