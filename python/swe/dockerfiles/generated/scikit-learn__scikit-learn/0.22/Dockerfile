FROM composio/swe:py3.6

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/scikit-learn && git clone --depth 1 https://github.com/scikit-learn/scikit-learn

# Set repository as workdir
WORKDIR /home/user/scikit-learn

# Fetch the base commit
RUN git fetch --depth 1 origin d360ffa7c5896a91ae498b3fb9cf464464ce8f34

# Checkout to base commit
RUN git checkout d360ffa7c5896a91ae498b3fb9cf464464ce8f34

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/scikit-learn/deeplake
COPY fqdn_cache.json /home/user/.composio/tmp/scikit-learn

WORKDIR /home/user/scikit-learn
# Install dependecies
RUN /home/user/.dev/bin/python -m pip install "numpy==1.19.2" "scipy==1.5.2" "cython" "pytest" "pandas" "matplotlib" --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org || echo "$?"

# Install package
RUN /home/user/.dev/bin/python -m pip install -v --no-use-pep517 --no-build-isolation -e . || echo "$?"

ENV HOME=/home/user/

WORKDIR /home/user/scikit-learn

# Switch to root
USER root