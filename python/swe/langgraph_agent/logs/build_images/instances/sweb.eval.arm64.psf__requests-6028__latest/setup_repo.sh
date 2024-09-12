#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/psf/requests /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard 0192aac24123735b3eaf9b08df46429bb770c283
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
python -m pip install .
