#!/bin/bash
set -euxo pipefail
git clone -o origin https://github.com/django/django /testbed
chmod -R 777 /testbed
cd /testbed
git reset --hard f8fab6f90233c7114d642dfe01a4e6d4cb14ee7d
git remote remove origin
source /opt/miniconda3/bin/activate
conda activate testbed
echo "Current environment: $CONDA_DEFAULT_ENV"
apt-get update && apt-get install -y locales
echo 'en_US UTF-8' > /etc/locale.gen
locale-gen en_US.UTF-8
python setup.py install
