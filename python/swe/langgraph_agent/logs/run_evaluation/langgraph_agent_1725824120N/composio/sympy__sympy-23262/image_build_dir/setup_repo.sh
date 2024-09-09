#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/sympy/sympy /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard fdc707f73a65a429935c01532cd3970d3355eab6
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
