# Build the image - docker build . -t composio/user
# Run a script using the image
# Say you have a script called agents/github.py
# You can execute this script using - docker run -v ./agents:/app:Z composio/user github.py

FROM python:3.10-slim-bullseye

VOLUME [ "/app" ]

WORKDIR /app

RUN python -m pip install composio-core==0.2.52

RUN python -m pip install composio-autogen==0.2.52 

# RUN python -m pip install composio-claude==0.2.47 # Not published yet

RUN python -m pip install composio-crewai==0.2.52

# RUN python -m pip install composio-griptape==0.2.47 # Not published yet

RUN python -m pip install composio-julep==0.2.52

RUN python -m pip install composio-langchain==0.2.52

RUN python -m pip install composio-lyzr==0.2.52

RUN python -m pip install composio-openai==0.2.52

ENTRYPOINT [ "python" ]