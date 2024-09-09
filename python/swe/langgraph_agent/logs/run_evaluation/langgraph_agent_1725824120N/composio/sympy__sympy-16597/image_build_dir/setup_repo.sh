#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/sympy/sympy /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 6fd65310fa3167b9626c38a5487e171ca407d988
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
