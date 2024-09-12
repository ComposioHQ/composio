FROM --platform=linux/arm64/v8 sweb.env.arm64.934a137824256b612e9dc5:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
