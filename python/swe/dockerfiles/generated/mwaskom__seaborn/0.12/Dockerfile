FROM composio/swe:py3.9

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/seaborn && git clone --depth 1 https://github.com/mwaskom/seaborn

# Set repository as workdir
WORKDIR /home/user/seaborn

# Fetch the base commit
RUN git fetch --depth 1 origin 54cab15bdacfaa05a88fbc5502a5b322d99f148e

# Checkout to base commit
RUN git checkout 54cab15bdacfaa05a88fbc5502a5b322d99f148e

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/seaborn
COPY fqdn_cache.json /home/user/.composio/tmp/seaborn

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "contourpy==1.1.0" "cycler==0.11.0" "fonttools==4.42.1" "importlib-resources==6.0.1" "kiwisolver==1.4.5" "matplotlib==3.7.2" "numpy==1.25.2" "packaging==23.1" "pandas==2.1.0" "pillow==10.0.0" "pyparsing==3.0.9" "python-dateutil==2.8.2" "pytz==2023.3.post1" "scipy==1.11.2" "six==1.16.0" "tzdata==2023.1" "zipp==3.16.2" || echo "$?"

WORKDIR /home/user/seaborn

# Install package
RUN /home/user/.dev/bin/python -m pip install -e .[dev] || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root