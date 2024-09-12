#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.9  -y
conda activate testbed
python -m pip install py==1.11.0 packaging==23.1 attrs==23.1.0 more-itertools==10.1.0 pluggy==0.13.1
