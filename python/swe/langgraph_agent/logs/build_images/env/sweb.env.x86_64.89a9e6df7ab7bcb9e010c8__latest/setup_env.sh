#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.7 -y
cat <<'EOF_59812759871' > $HOME/requirements.txt

codecov
coverage
cycler
numpy
pillow
pyparsing
pytest
pytest-cov
pytest-faulthandler
pytest-rerunfailures
pytest-timeout
pytest-xdist
python-dateutil
tornado
tox

EOF_59812759871
conda activate testbed && python -m pip install -r $HOME/requirements.txt
rm $HOME/requirements.txt
conda activate testbed
python -m pip install pytest
