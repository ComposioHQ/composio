#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.9  -y
conda activate testbed
python -m pip install contourpy==1.1.0 cycler==0.11.0 fonttools==4.42.1 importlib-resources==6.0.1 kiwisolver==1.4.5 matplotlib==3.7.2 numpy==1.25.2 packaging==23.1 pandas==2.0.0 pillow==10.0.0 pyparsing==3.0.9 pytest python-dateutil==2.8.2 pytz==2023.3.post1 scipy==1.11.2 six==1.16.0 tzdata==2023.1 zipp==3.16.2
