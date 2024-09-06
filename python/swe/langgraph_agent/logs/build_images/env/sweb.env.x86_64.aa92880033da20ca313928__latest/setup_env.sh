#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.6 numpy scipy cython pytest pandas matplotlib -y
conda activate testbed
python -m pip install cython numpy==1.19.2 setuptools scipy==1.5.2
