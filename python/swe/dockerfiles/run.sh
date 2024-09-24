#! /bin/bash


cd generated/astropy__astropy/4.3
docker build --no-cache -t composio/swe:astropy-astropy-4-3 -f Dockerfile . 
