#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.8 -y
cat <<'EOF_59812759871' > $HOME/requirements.txt
sphinx>=1.8.1,!=2.0.0,<4.3.0
colorspacious
ipython
ipywidgets
numpydoc>=0.8
packaging>=20
pyparsing<3.0.0
mpl-sphinx-theme
sphinxcontrib-svg2pdfconverter>=1.1.0
sphinx-gallery>=0.10
sphinx-copybutton
sphinx-panels
scipy


certifi
coverage
pyparsing<3.0.0
pytest!=4.6.0,!=5.4.0
pytest-cov
pytest-rerunfailures
pytest-timeout
pytest-xdist
python-dateutil
tornado


ipykernel
nbconvert[execute]!=6.0.0,!=6.0.1
nbformat!=5.0.0,!=5.0.1
pandas!=0.25.0
pikepdf
pytz
pywin32; sys.platform == 'win32'


flake8>=3.8
pydocstyle>=5.1.0
flake8-docstrings>=1.4.0


EOF_59812759871
conda activate testbed && python -m pip install -r $HOME/requirements.txt
rm $HOME/requirements.txt
conda activate testbed
python -m pip install pytest ipython
