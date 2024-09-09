#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/pytest-dev/pytest /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard aa55975c7d3f6c9f6d7f68accc41bb7cadf0eb9a
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
