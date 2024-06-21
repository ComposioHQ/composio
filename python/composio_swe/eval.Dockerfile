FROM ubuntu:jammy

# Install third party tools
RUN apt-get update && \
    apt-get install -y bash gcc git jq wget g++ make vim python3.9 python3-pip docker.io && \
    apt-get clean && \
    #curl -sSL https://get.docker.com/ | sh && \
    rm -rf /var/lib/apt/lists/*


RUN pip install swebench

RUN mkdir -p /evaluation
COPY . /evaluation

WORKDIR /evaluation
RUN pip install -e .
#CMD ["python", "coders/composio_coders/benchmark/run_evaluation.py"]
CMD ["/bin/bash"]
