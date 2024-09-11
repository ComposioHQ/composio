#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/pydata/xarray /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 37522e991a32ee3c0ad1a5ff8afe8e3eb1885550
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
