FROM --platform=linux/arm64/v8 sweb.env.arm64.756beac07713d7e8dc1129:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
