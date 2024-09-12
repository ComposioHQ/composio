FROM --platform=linux/arm64/v8 sweb.env.arm64.5d1fda9d55d65d8a4e5bdb:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
