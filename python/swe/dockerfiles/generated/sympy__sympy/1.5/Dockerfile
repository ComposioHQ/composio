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
RUN git fetch --depth 1 origin aefdd023dc4f73c441953ed51f5f05a076f0862f

# Checkout to base commit
RUN git checkout aefdd023dc4f73c441953ed51f5f05a076f0862f

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/sympy/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/sympy

# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "mpmath==1.3.0" "flake8-comprehensions" "flake8" || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/sympy

# Switch to root
USER root