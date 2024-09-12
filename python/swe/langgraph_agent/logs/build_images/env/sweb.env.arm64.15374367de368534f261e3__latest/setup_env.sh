#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.8 -y
cat <<'EOF_59812759871' > $HOME/requirements.txt

coverage
pytest!=4.6.0
pytest-cov
pytest-rerunfailures
pytest-timeout
pytest-xdist
python-dateutil
tornado

EOF_59812759871
conda activate testbed && python -m pip install -r $HOME/requirements.txt
rm $HOME/requirements.txt
conda activate testbed
python -m pip install pytest ipython
