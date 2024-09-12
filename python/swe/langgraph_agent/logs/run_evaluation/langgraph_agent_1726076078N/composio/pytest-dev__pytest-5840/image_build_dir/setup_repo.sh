#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/pytest-dev/pytest /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 73c5b7f4b11a81e971f7d1bb18072e06a87060f4
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
