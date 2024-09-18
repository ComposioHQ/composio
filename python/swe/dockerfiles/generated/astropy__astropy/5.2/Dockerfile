FROM composio/swe:py3.9

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/astropy && git clone --depth 1 https://github.com/astropy/astropy

# Set repository as workdir
WORKDIR /home/user/astropy

# Fetch the base commit
RUN git fetch --depth 1 origin 80c3854a5f4f4a6ab86c03d9db7854767fcd83c1

# Checkout to base commit
RUN git checkout 80c3854a5f4f4a6ab86c03d9db7854767fcd83c1

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/astropy/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/astropy

# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "attrs==23.1.0" "exceptiongroup==1.1.3" "execnet==2.0.2" "hypothesis==6.82.6" "iniconfig==2.0.0" "numpy==1.25.2" "packaging==23.1" "pluggy==1.3.0" "psutil==5.9.5" "pyerfa==2.0.0.3" "pytest-arraydiff==0.5.0" "pytest-astropy-header==0.2.2" "pytest-astropy==0.10.0" "pytest-cov==4.1.0" "pytest-doctestplus==1.0.0" "pytest-filter-subpackage==0.1.2" "pytest-mock==3.11.1" "pytest-openfiles==0.5.0" "pytest-remotedata==0.4.0" "pytest-xdist==3.3.1" "pytest==7.4.0" "PyYAML==6.0.1" "setuptools==68.0.0" "sortedcontainers==2.4.0" "tomli==2.0.1" || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install -e .[test] || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/astropy

# Switch to root
USER root