FROM --platform=linux/arm64/v8 sweb.env.arm64.27dd9791e13f5c857a09f9:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
