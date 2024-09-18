FROM composio/swe:py3.6

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/django && git clone --depth 1 https://github.com/django/django

# Set repository as workdir
WORKDIR /home/user/django

# Fetch the base commit
RUN git fetch --depth 1 origin b9cf764be62e77b4777b3a75ec256f6209a57671

# Checkout to base commit
RUN git checkout b9cf764be62e77b4777b3a75ec256f6209a57671

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/django/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/django

# Install dependecies
COPY requirements.txt _requirements.txt

# Install from requirements.txt
RUN /home/user/.dev/bin/python -m pip install -r _requirements.txt || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m python setup.py install || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/django

# Switch to root
USER root