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
RUN git fetch --depth 1 origin 0192aac24123735b3eaf9b08df46429bb770c283

# Checkout to base commit
RUN git checkout 0192aac24123735b3eaf9b08df46429bb770c283

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/requests
COPY fqdn_cache.json /home/user/.composio/tmp/requests

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "pytest" || echo "$?"

WORKDIR /home/user/requests

RUN git add -u
RUN git config --global user.email "example@example.com"
RUN git config --global user.name "composio"
RUN git commit -m "fix: setup complete"

# Install package
RUN /home/user/.dev/bin/python -m pip install . || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root