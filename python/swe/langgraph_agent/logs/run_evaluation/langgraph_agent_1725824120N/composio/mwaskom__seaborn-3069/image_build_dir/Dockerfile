FROM --platform=linux/arm64/v8 sweb.env.arm64.a0efca7a0fe6719dbf65c2:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
