FROM --platform=linux/arm64/v8 sweb.env.arm64.7f83a0ba1392a745c061ce:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
