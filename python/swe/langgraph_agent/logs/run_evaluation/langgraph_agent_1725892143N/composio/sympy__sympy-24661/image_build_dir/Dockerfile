FROM --platform=linux/arm64/v8 sweb.env.arm64.c795f4b88616b8462021ed:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
