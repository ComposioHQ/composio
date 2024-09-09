FROM --platform=linux/arm64/v8 sweb.env.arm64.1c1a6945f732f9391228c5:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
