#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/psf/requests /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 5f7a3a74aab1625c2bb65f643197ee885e3da576
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install .
