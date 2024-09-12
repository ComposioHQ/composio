FROM --platform=linux/arm64/v8 sweb.env.arm64.e3afd7f04b325a4de4982d:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
