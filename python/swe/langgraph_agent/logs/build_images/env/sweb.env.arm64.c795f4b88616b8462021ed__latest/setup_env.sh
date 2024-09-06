#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.9 mpmath flake8 -y
conda activate testbed
python -m pip install mpmath==1.3.0 flake8-comprehensions
