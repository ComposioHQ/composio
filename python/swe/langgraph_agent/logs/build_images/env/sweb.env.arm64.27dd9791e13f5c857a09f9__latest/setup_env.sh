#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.9 numpy scipy cython setuptools pytest pandas matplotlib joblib threadpoolctl -y
conda activate testbed
python -m pip install cython setuptools numpy scipy
