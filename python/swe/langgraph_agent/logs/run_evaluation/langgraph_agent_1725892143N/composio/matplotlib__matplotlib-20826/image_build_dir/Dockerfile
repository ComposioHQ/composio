FROM --platform=linux/arm64/v8 sweb.env.arm64.b382c45e0a94d34ef0fc86:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
