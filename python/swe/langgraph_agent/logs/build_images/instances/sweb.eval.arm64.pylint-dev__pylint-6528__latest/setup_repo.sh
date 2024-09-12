#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/pylint-dev/pylint /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 273a8b25620467c1e5686aa8d2a1dbb8c02c78d0
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install -e .
