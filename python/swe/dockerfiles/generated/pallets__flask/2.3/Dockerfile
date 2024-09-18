FROM composio/swe:py3.11

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/flask && git clone --depth 1 https://github.com/pallets/flask

# Set repository as workdir
WORKDIR /home/user/flask

# Fetch the base commit
RUN git fetch --depth 1 origin 7ee9ceb71e868944a46e1ff00b506772a53a4f1d

# Checkout to base commit
RUN git checkout 7ee9ceb71e868944a46e1ff00b506772a53a4f1d

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/flask/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/flask

# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "click==8.1.3" "itsdangerous==2.1.2" "Jinja2==3.1.2" "MarkupSafe==2.1.1" "Werkzeug==2.3.7" || echo "$?"

# Install dependecies
COPY requirements.txt _requirements.txt

# Install from requirements.txt
RUN /home/user/.dev/bin/python -m pip install -r _requirements.txt || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/flask

# Switch to root
USER root