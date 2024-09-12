FROM --platform=linux/x86_64 sweb.env.x86_64.f45b85486922bdccb83010:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
