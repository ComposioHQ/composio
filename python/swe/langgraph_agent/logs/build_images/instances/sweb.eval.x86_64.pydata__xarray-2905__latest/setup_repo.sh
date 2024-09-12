#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/pydata/xarray /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 7c4e2ac83f7b4306296ff9b7b51aaf016e5ad614
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
