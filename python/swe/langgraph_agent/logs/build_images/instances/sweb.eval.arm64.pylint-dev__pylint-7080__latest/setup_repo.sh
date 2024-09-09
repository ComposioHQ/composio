#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/pylint-dev/pylint /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 3c5eca2ded3dd2b59ebaf23eb289453b5d2930f0
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
