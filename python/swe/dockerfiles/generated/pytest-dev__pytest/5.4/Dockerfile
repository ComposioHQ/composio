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
RUN git fetch --depth 1 origin 5e7f1ab4bf58e473e5d7f878eb2b499d7deabd29

# Checkout to base commit
RUN git checkout 5e7f1ab4bf58e473e5d7f878eb2b499d7deabd29

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/pytest
COPY fqdn_cache.json /home/user/.composio/tmp/pytest

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "py==1.11.0" "packaging==23.1" "attrs==23.1.0" "more-itertools==10.1.0" "pluggy==0.13.1" || echo "$?"

WORKDIR /home/user/pytest

RUN git add -u
RUN git config --global user.email "example@example.com"
RUN git config --global user.name "composio"
RUN git commit -m "fix: setup complete"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root