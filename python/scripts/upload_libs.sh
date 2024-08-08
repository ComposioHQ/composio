#!/bin/bash
set -e

upload_package() {
  cd $1
  rm -rf dist/
  python -m build
  python -m twine upload --username token --password $PYPI_PASSWORD --repository pypi dist/*
  cd ..
}

upload_package core
upload_package langchain
upload_package crew_ai
upload_package autogen
upload_package lyzr