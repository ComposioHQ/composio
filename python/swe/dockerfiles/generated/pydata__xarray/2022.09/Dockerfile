FROM composio/swe:py3.10

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/xarray && git clone --depth 1 https://github.com/pydata/xarray

# Set repository as workdir
WORKDIR /home/user/xarray

# Fetch the base commit
RUN git fetch --depth 1 origin 3aa75c8d00a4a2d4acf10d80f76b937cadb666b7

# Checkout to base commit
RUN git checkout 3aa75c8d00a4a2d4acf10d80f76b937cadb666b7

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/xarray
COPY fqdn_cache.json /home/user/.composio/tmp/xarray

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "numpy==1.25.2" "packaging==23.1" "pandas==1.5.3" "pytest==8.1.1" "python-dateutil==2.8.2" "pytz==2023.3" "six==1.16.0" || echo "$?"

WORKDIR /home/user/xarray

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root