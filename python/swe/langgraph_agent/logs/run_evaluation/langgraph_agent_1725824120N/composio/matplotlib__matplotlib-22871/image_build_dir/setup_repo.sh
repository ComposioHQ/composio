#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/matplotlib/matplotlib /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard a7b7260bf06c20d408215d95ce20a1a01c12e5b1
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
apt-get -y update && apt-get -y upgrade && apt-get install -y imagemagick ffmpeg texlive texlive-latex-extra texlive-fonts-recommended texlive-xetex texlive-luatex cm-super dvipng
python -m pip install -e .
