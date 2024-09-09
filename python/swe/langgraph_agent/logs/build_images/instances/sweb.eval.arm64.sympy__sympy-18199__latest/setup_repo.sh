#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/sympy/sympy /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard ba80d1e493f21431b4bf729b3e0452cd47eb9566
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
