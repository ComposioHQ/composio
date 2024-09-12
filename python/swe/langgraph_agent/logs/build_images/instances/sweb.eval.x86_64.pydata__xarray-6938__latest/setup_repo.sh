#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/pydata/xarray /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard c4e40d991c28be51de9ac560ce895ac7f9b14924
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
