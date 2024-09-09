#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/sympy/sympy /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 94fb720696f5f5d12bad8bc813699fd696afd2fb
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
