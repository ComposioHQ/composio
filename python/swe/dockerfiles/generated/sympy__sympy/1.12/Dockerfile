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
RUN git fetch --depth 1 origin 39de9a2698ad4bb90681c0fdb70b30a78233145f

# Checkout to base commit
RUN git checkout 39de9a2698ad4bb90681c0fdb70b30a78233145f

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/sympy
COPY fqdn_cache.json /home/user/.composio/tmp/sympy

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "mpmath==1.3.0" "flake8-comprehensions" "flake8" || echo "$?"

WORKDIR /home/user/sympy

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root