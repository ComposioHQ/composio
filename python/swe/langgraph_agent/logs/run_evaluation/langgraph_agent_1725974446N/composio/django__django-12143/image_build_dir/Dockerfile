FROM --platform=linux/arm64/v8 sweb.env.arm64.a18371b03f944585b4f08c:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
