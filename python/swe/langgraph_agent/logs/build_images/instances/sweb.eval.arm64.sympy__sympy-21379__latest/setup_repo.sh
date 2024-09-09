#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/sympy/sympy /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 624217179aaf8d094e6ff75b7493ad1ee47599b0
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
