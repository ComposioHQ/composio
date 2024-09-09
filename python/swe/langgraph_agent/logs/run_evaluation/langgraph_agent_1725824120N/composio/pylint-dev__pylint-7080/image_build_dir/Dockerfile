FROM --platform=linux/arm64/v8 sweb.env.arm64.b649f0ff62fad147f7f073:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
