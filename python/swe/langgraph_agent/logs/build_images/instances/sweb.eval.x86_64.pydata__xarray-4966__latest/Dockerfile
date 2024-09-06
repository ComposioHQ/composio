FROM --platform=linux/x86_64 sweb.env.x86_64.502d8fc6ebccd881244091:latest

COPY ./setup_repo.sh /root/
RUN /bin/bash /root/setup_repo.sh

WORKDIR /testbed/
