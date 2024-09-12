#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.5 -y
cat <<'EOF_59812759871' > $HOME/requirements.txt
argon2-cffi >= 16.1.0
bcrypt
docutils
geoip2
jinja2 >= 2.9.2
numpy
Pillow
PyYAML
pylibmc; sys.platform != 'win32'
pytz
selenium
sqlparse
tblib

python3-memcached

EOF_59812759871
conda activate testbed && python -m pip install -r $HOME/requirements.txt
rm $HOME/requirements.txt
conda activate testbed
python -m pip install setuptools
