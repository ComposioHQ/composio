FROM --platform=linux/arm64/v8 sweb.env.arm64.2baaea72acc974f6c02079:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
