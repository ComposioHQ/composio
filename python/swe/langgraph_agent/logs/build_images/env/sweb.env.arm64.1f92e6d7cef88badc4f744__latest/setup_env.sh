#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.9 pytest -y
conda activate testbed
