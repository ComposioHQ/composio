FROM --platform=linux/arm64/v8 sweb.env.arm64.e83e37f52c09532c62acfb:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
