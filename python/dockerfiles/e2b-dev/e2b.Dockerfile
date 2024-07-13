FROM python:3.12

# Install dependencies and customize sandbox
RUN apt update \
    && apt install sudo

# Set working dir
WORKDIR /root

# Copy source
COPY ./composio /root/composio

# Install from source
RUN pip install /root/composio/

# Remove cache
RUN rm -rf /root/composio/

# Define entry point
ENTRYPOINT [ "composio",  "serve", "-h", "0.0.0.0" ]
