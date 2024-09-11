#! /bin/bash

cd templates
docker build -t composio/swe:pyenv -f Dockerfile.pyenv .

cd ../generated/base
<<<<<<< HEAD
docker build -t composio/swe:py3.9 -f Dockerfile.py3.9 .


cd ../sphinx-doc__sphinx/4.2
docker build -t composio/swe:sphinx-doc-sphinx-4-2 -f Dockerfile .
=======
docker build -t composio/swe:py3.6 -f Dockerfile.py3.6 .


cd ../django__django/3.0
docker build -t composio/swe:django-django-3-0 -f Dockerfile .
>>>>>>> master
