FROM --platform=linux/arm64/v8 sweb.env.arm64.1f92e6d7cef88badc4f744:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
