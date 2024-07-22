FROM techcomposio/swe-agent

# Install dependencies
RUN apt update \
    && apt install sudo \
    && apt install openssh-server sudo python3-pip uuid-runtime curl -y

# Install composio
RUN /bin/python3 -m pip install composio-core==0.3.23 fastapi

# Define entry point
COPY entrypoint.sh /root/entrypoint.sh

# Run entrypoint.sh
ENTRYPOINT [ "/root/entrypoint.sh" ]
