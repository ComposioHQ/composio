FROM ubuntu:latest

RUN apt-get update && \
    apt-get install -y bash gcc git jq wget vim && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN git config --global user.email "swebench@pnlp.org"
RUN git config --global user.name "swebench"

ENV PATH="/root/miniconda3/bin:${PATH}"
ARG PATH="/root/miniconda3/bin:${PATH}"
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh \
    && mkdir /root/.conda \
    && bash miniconda.sh -b \
    && rm -f miniconda.sh
RUN conda --version

RUN pip install swebench

RUN mkdir -p /evaluation
COPY . /evaluation

WORKDIR /

CMD ["/bin/bash"]