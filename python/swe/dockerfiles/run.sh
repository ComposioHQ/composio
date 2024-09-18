#! /bin/bash

cd templates
docker build -t composio/swe:pyenv -f Dockerfile.pyenv .

cd ../generated/base
docker build -t composio/swe:py3.9 -f Dockerfile.py3.9 .


cd ../sphinx-doc__sphinx/4.3
docker build -t composio/swe:sphinx-doc-sphinx-4-3 -f Dockerfile .
