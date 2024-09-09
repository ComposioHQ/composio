#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/pydata/xarray /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard e05fddea852d08fc0845f954b79deb9e9f9ff883
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
