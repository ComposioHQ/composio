FROM composio/swe:py3.8

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/matplotlib && git clone --depth 1 https://github.com/matplotlib/matplotlib

# Set repository as workdir
WORKDIR /home/user/matplotlib

# Fetch the base commit
RUN git fetch --depth 1 origin d65c9ca20ddf81ef91199e6d819f9d3506ef477c

# Checkout to base commit
RUN git checkout d65c9ca20ddf81ef91199e6d819f9d3506ef477c

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/matplotlib
COPY fqdn_cache.json /home/user/.composio/tmp/matplotlib

# Install dependencies
COPY requirements.txt _requirements.txt

# Install from requirements.txt
RUN /home/user/.dev/bin/python -m pip install -r _requirements.txt || echo "$?"

WORKDIR /home/user/matplotlib

RUN git add -u
RUN git config --global user.email "example@example.com"
RUN git config --global user.name "composio"
RUN git commit -m "fix: setup complete"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root