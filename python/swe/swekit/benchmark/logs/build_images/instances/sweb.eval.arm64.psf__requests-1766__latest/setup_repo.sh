#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/psf/requests /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 847735553aeda6e6633f2b32e14ba14ba86887a4
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install .
