FROM composio/swe:py3.9

# Switch user
USER user

# Go to user dir
WORKDIR /home/user

# Clone github repository
RUN git config --global http.postBuffer 157286400 && git config --global --add safe.directory /home/user/sphinx && git clone --depth 1 https://github.com/sphinx-doc/sphinx

# Set repository as workdir
WORKDIR /home/user/sphinx

# Fetch the base commit
RUN git fetch --depth 1 origin 07983a5a8704ad91ae855218ecbda1c8598200ca

# Checkout to base commit
RUN git checkout 07983a5a8704ad91ae855218ecbda1c8598200ca

WORKDIR /home/user

RUN mkdir -p /home/user/.composio/tmp
COPY deeplake /home/user/.composio/tmp/sphinx
COPY fqdn_cache.json /home/user/.composio/tmp/sphinx

# Install dependencies
RUN /home/user/.dev/bin/python -m pip install "tox" || echo "$?"

WORKDIR /home/user/sphinx

# Pre install
RUN sed -i 's/pytest/pytest -rA/' tox.ini
RUN sed -i 's/Jinja2>=2.3/Jinja2<3.0/' setup.py
RUN sed -i 's/sphinxcontrib-applehelp/sphinxcontrib-applehelp<=1.0.7/' setup.py
RUN sed -i 's/sphinxcontrib-devhelp/sphinxcontrib-devhelp<=1.0.5/' setup.py
RUN sed -i 's/sphinxcontrib-qthelp/sphinxcontrib-qthelp<=1.0.6/' setup.py
RUN sed -i 's/alabaster>=0.7,<0.8/alabaster>=0.7,<0.7.12/' setup.py
RUN sed -i "s/'packaging',/'packaging', 'markupsafe<=2.0.1',/" setup.py
RUN sed -i 's/sphinxcontrib-htmlhelp/sphinxcontrib-htmlhelp<=2.0.4/' setup.py
RUN sed -i 's/sphinxcontrib-serializinghtml/sphinxcontrib-serializinghtml<=1.1.9/' setup.py

# Install package
RUN /home/user/.dev/bin/python -m pip install -e .[test] || echo "$?"

ENV HOME=/home/user/

# Switch to root
USER root