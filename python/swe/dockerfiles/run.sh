#! /bin/bash

cd templates

docker build -t composio/swe:pyenv -f Dockerfile.pyenv .

cd ../generated/base

docker build -t composio/swe:py3.11 -f Dockerfile.py3.11 .

cd ../pallets__flask/2.3

docker build -t composio/swe:pallets-flask-2-3 -f Dockerfile .

