#!/usr/bin/env bash

# Helper script to get the right conda version inside of the container
# This logic is put inside of the container rather than in the build script
# so that we can easily do multi-platform builds

arch=$1
echo "arch", $arch
if [[ "$arch" == "x86_64" || "$arch" == "amd64" ]]; then
  echo "Building the x86 Docker image"
  wget https://repo.anaconda.com/miniconda/Miniconda3-py39_23.11.0-1-Linux-x86_64.sh -O miniconda.sh
elif [[ "$arch" == "aarch64" || "$arch" == "arm64" ]]; then
  echo "Ayy, arm64 in the house!"
  wget https://repo.anaconda.com/miniconda/Miniconda3-py39_23.11.0-1-Linux-aarch64.sh -O miniconda.sh
else
  echo "unknown architecture detected?"
  echo $arch
  exit 1
fi
