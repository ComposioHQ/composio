#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
conda create -n testbed python=3.9 -y
cat <<'EOF_59812759871' > $HOME/requirements.txt
aiosmtpd
asgiref >= 3.6.0
argon2-cffi >= 19.2.0
backports.zoneinfo; python_version < '3.9'
bcrypt
black
docutils
geoip2; python_version < '3.12'
jinja2 >= 2.11.0
numpy; python_version < '3.12'
Pillow >= 6.2.1; sys.platform != 'win32' or python_version < '3.12'
pylibmc; sys.platform != 'win32'
pymemcache >= 3.4.0
pytz
pywatchman; sys.platform != 'win32'
PyYAML
redis >= 3.4.0
selenium
sqlparse >= 0.3.1
tblib >= 1.5.0
tzdata
colorama; sys.platform == 'win32'

EOF_59812759871
conda activate testbed && python -m pip install -r $HOME/requirements.txt
rm $HOME/requirements.txt
conda activate testbed
