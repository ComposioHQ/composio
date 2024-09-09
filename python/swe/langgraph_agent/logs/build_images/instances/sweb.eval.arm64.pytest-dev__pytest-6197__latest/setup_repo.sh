#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/pytest-dev/pytest /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard e856638ba086fcf5bebf1bebea32d5cf78de87b4
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
