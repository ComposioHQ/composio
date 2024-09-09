#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/pydata/xarray /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard d3b6aa6d8b997df115a53c001d00222a0f92f63a
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
