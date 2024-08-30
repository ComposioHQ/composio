#! /bin/bash

cd templates
docker build -t composio/swe:pyenv -f Dockerfile.pyenv .

cd ../generated/base
docker build -t composio/swe:py3.6 -f Dockerfile.py3.6 .

# cd ../pallets__flask/2.3
# docker build -t composio/swe:pallets-flask-2-3 -f Dockerfile .

# cd ../django__django/5.0
# docker build -t composio/swe:django-django-5-0 -f Dockerfile .


cd ../django__django/3.0
docker build -t composio/swe:django-django-3-0 -f Dockerfile .
