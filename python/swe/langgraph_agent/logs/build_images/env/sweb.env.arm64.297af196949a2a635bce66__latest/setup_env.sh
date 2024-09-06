#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.8 -y
cat <<'EOF_59812759871' > $HOME/requirements.txt
asgiref >= 3.3.2
argon2-cffi >= 16.1.0
backports.zoneinfo; python_version < '3.9'
bcrypt
docutils
geoip2
jinja2 >= 2.9.2
numpy
Pillow >= 6.2.0
pylibmc; sys.platform != 'win32'
pymemcache >= 3.4.0
python-memcached >= 1.59
pytz
pywatchman; sys.platform != 'win32'
PyYAML
redis >= 3.0.0
selenium
sqlparse >= 0.2.2
tblib >= 1.5.0
tzdata
colorama; sys.platform == 'win32'

EOF_59812759871
conda activate testbed && python -m pip install -r $HOME/requirements.txt
rm $HOME/requirements.txt
conda activate testbed
