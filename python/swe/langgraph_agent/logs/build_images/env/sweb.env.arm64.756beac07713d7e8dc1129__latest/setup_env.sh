#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.9  -y
conda activate testbed
python -m pip install atomicwrites==1.4.1 attrs==23.1.0 more-itertools==10.1.0 pluggy==0.11.0 py==1.11.0 setuptools==68.0.0 six==1.16.0 wcwidth==0.2.6
