FROM --platform=linux/arm64/v8 sweb.env.arm64.c6d251a05e0af7688b64fd:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
