FROM composio/swe:py3.9

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/sympy && git clone --depth 1 https://github.com/sympy/sympy

# Set repository as workdir
WORKDIR /home/user/sympy

# Fetch the base commit
RUN git fetch --depth 1 origin 9ef28fba5b4d6d0168237c9c005a550e6dc27d81

# Checkout to base commit
RUN git checkout 9ef28fba5b4d6d0168237c9c005a550e6dc27d81

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/sympy
COPY fqdn_cache.json /home/user/.composio/tmp/sympy

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "mpmath==1.3.0" "flake8-comprehensions" "flake8" || echo "$?"

WORKDIR /home/user/sympy

RUN git add -u
RUN git config --global user.email "example@example.com"
RUN git config --global user.name "composio"
RUN git commit -m "fix: setup complete"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root