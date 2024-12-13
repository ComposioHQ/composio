FROM composio/composio:latest

# Install dependencies
RUN apt update && apt install -y make build-essential libssl-dev zlib1g-dev libbz2-dev \
    libreadline-dev libsqlite3-dev wget curl llvm libncurses5-dev libncursesw5-dev \
    xz-utils tk-dev libffi-dev liblzma-dev

USER user

# Go to user dir
WORKDIR /home/user

# Install pyenv
RUN curl https://pyenv.run | bash
# Go to user dir
WORKDIR /home/user

# Install required python version
RUN /home/user/.pyenv/bin/pyenv install 3.11.0

# Create development environment for agent
RUN /home/user/.pyenv/versions/3.11.0/bin/python -m venv /home/user/.dev/

# Upgrade packages
RUN /home/user/.dev/bin/python -m pip install --upgrade pip setuptools wheel \
    --trusted-host pypi.org \
    --trusted-host pypi.python.org \
    --trusted-host files.pythonhosted.org

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

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "click==8.1.3" "itsdangerous==2.1.2" "Jinja2==3.1.2" "MarkupSafe==2.1.1" "Werkzeug==2.3.7" || echo "$?"

# Install dependencies
COPY requirements.txt _requirements.txt

# Install from requirements.txt
RUN /home/user/.dev/bin/python -m pip install -r _requirements.txt || echo "$?"

WORKDIR /home/user/flask

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root