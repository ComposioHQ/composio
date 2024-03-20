#!/bin/bash
set -e

upload_package() {
  cd $1
  rm -rf dist/
  python -m build
  python -m twine upload --username token --password pypi-AgEIcHlwaS5vcmcCJGY3MjVhMDA0LTQxYTYtNDUwNC1hMjU2LWUyMjNlNzMxMzEyMgACKlszLCJjZDE2M2QxMS1hODFkLTQzMTctYjg5NC01NjkxNWQzMGEwOTUiXQAABiDfUHq3bqRmmHqOt8MJklS-YfbKV_Q0S3PepVim1EQeCg --repository pypi dist/*
  cd ..
}

upload_package core
upload_package langchain
upload_package crew_ai
