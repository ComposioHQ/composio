#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
cat <<'EOF_59812759871' > environment.yml
# To set up a development environment using conda run:
#
#   conda env create -f environment.yml
#   conda activate mpl-dev
#   pip install -e .
#
name: testbed
channels:
  - conda-forge
dependencies:
  # runtime dependencies
  - cairocffi
  - contourpy>=1.0.1
  - cycler>=0.10.0
  - fonttools>=4.22.0
  - importlib-resources>=3.2.0
  - kiwisolver>=1.0.1
  - numpy>=1.21
  - pillow>=6.2
  - pybind11>=2.6.0
  - pygobject
  - pyparsing
  - pyqt
  - python-dateutil>=2.1
  - setuptools
  - setuptools_scm
  - wxpython
  # building documentation
  - colorspacious
  - graphviz
  - ipython
  - ipywidgets
  - numpydoc>=0.8
  - packaging
  - pydata-sphinx-theme
  - pyyaml
  - sphinx>=1.8.1,!=2.0.0
  - sphinx-copybutton
  - sphinx-gallery>=0.10
  - sphinx-design
  - pip
  - pip:
      - mpl-sphinx-theme
      - sphinxcontrib-svg2pdfconverter
      - pikepdf
  # testing
  - coverage
  - flake8>=3.8
  - flake8-docstrings>=1.4.0
  - gtk4
  - ipykernel
  - nbconvert[execute]!=6.0.0,!=6.0.1
  - nbformat!=5.0.0,!=5.0.1
  - pandas!=0.25.0
  - psutil
  - pre-commit
  - pydocstyle>=5.1.0
  - pytest!=4.6.0,!=5.4.0
  - pytest-cov
  - pytest-rerunfailures
  - pytest-timeout
  - pytest-xdist
  - tornado
  - pytz

EOF_59812759871
conda env create --file environment.yml
conda activate testbed && conda install python=3.11 -y
rm environment.yml
conda activate testbed
python -m pip install contourpy==1.1.0 cycler==0.11.0 fonttools==4.42.1 ghostscript kiwisolver==1.4.5 numpy==1.25.2 packaging==23.1 pillow==10.0.0 pikepdf pyparsing==3.0.9 python-dateutil==2.8.2 six==1.16.0 setuptools==68.1.2 setuptools-scm==7.1.0 typing-extensions==4.7.1
