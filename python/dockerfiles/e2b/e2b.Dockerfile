FROM techcomposio/swe-agent

# Install dependencies and customize sandbox
RUN apt update \
    && apt install sudo

# Install pip
RUN sudo apt install python3-pip -y

# Install composio
RUN /bin/python3 -m pip install composio-core==0.3.20 fastapi

# Define entry point
ENTRYPOINT [ "composio",  "serve", "-h", "0.0.0.0" ]
