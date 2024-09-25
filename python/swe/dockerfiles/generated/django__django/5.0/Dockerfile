FROM composio/swe:py3.11

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/django && git clone --depth 1 https://github.com/django/django

# Set repository as workdir
WORKDIR /home/user/django

# Fetch the base commit
RUN git fetch --depth 1 origin 1250483ebf73f7a82ff820b94092c63ce4238264

# Checkout to base commit
RUN git checkout 1250483ebf73f7a82ff820b94092c63ce4238264

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/django
COPY fqdn_cache.json /home/user/.composio/tmp/django

# Install dependencies
COPY requirements.txt _requirements.txt

# Install from requirements.txt
RUN /home/user/.dev/bin/python -m pip install -r _requirements.txt || echo "$?"

WORKDIR /home/user/django

RUN git add -u
RUN git config --global user.email "example@example.com"
RUN git config --global user.name "composio"
RUN git commit -m "fix: setup complete"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root