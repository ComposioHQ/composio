FROM --platform=linux/arm64/v8 sweb.env.arm64.a33dddf55cdff5d8e23374:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
