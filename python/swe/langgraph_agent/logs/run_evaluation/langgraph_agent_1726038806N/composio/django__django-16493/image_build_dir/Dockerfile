FROM --platform=linux/arm64/v8 sweb.env.arm64.c70909fdac4897d1c685df:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
