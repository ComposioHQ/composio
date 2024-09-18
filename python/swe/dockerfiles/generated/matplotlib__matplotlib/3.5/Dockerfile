FROM composio/swe:py3.11

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/matplotlib && git clone --depth 1 https://github.com/matplotlib/matplotlib

# Set repository as workdir
WORKDIR /home/user/matplotlib

# Fetch the base commit
RUN git fetch --depth 1 origin a2a1b0a11b993fe5f8fab64b6161e99243a6393c

# Checkout to base commit
RUN git checkout a2a1b0a11b993fe5f8fab64b6161e99243a6393c

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/matplotlib/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/matplotlib

# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "contourpy==1.1.0" "cycler==0.11.0" "fonttools==4.42.1" "kiwisolver==1.4.5" "numpy==1.25.2" "packaging==23.1" "pillow==10.0.0" "pyparsing==3.0.9" "python-dateutil==2.8.2" "six==1.16.0" "setuptools==68.1.2" "setuptools-scm==7.1.0" "typing-extensions==4.7.1" || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/matplotlib

# Switch to root
USER root