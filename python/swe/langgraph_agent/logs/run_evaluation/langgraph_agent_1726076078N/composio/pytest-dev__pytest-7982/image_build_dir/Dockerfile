FROM --platform=linux/arm64/v8 sweb.env.arm64.8f1f7b974f0c57c7aeba39:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
