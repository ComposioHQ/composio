FROM --platform=linux/arm64/v8 sweb.env.arm64.15374367de368534f261e3:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
