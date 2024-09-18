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
RUN git fetch --depth 1 origin cc183652bf6e1273e985e1c4b3cba79c896c1193

# Checkout to base commit
RUN git checkout cc183652bf6e1273e985e1c4b3cba79c896c1193

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/xarray/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/xarray

# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "numpy==1.25.2" "packaging==23.1" "pandas==1.5.3" "pytest==8.1.1" "python-dateutil==2.8.2" "pytz==2023.3" "six==1.16.0" || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e . || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/xarray

# Switch to root
USER root