#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.6 -y
cat <<'EOF_59812759871' > $HOME/requirements.txt
asgiref >= 3.2
argon2-cffi >= 16.1.0
bcrypt
docutils
geoip2
jinja2 >= 2.9.2
numpy
Pillow >= 6.2.0
pylibmc; sys.platform != 'win32'
python-memcached >= 1.59
pytz
pywatchman; sys.platform != 'win32'
PyYAML
selenium
sqlparse >= 0.2.2
tblib >= 1.5.0

EOF_59812759871
conda activate testbed && python -m pip install -r $HOME/requirements.txt
rm $HOME/requirements.txt
conda activate testbed
