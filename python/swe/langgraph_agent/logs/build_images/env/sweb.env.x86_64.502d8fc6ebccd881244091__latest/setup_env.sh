#!/bin/bash
set -euxo pipefail
source /opt/miniconda3/bin/activate
cat <<'EOF_59812759871' > environment.yml
name: testbed
channels:
  - conda-forge
  - nodefaults
dependencies:
  - aiobotocore
  - boto3
  - bottleneck
  - cartopy
  - cdms2
  - cfgrib
  - cftime
  - dask
  - distributed
  - h5netcdf
  - h5py
  - hdf5
  - hypothesis
  - iris
  - lxml    # Optional dep of pydap
  - matplotlib-base
  - nc-time-axis
  - netcdf4
  - numba
  - numexpr
  - numpy
  - pandas
  - pint
  - pip
  - pooch
  - pre-commit
  - pseudonetcdf
  - pydap
  # - pynio: not compatible with netCDF4>1.5.3; only tested in py37-bare-minimum
  - pytest
  - pytest-cov
  - pytest-env
  - pytest-xdist
  - rasterio
  - scipy
  - seaborn
  - setuptools
  - sparse
  - toolz
  - zarr
  - pip:
    - numbagg

EOF_59812759871
conda create -c conda-forge -n testbed python=3.10 -y
conda env update -f environment.yml
rm environment.yml
conda activate testbed
python -m pip install numpy==1.23.0 packaging==23.1 pandas==1.5.3 pytest==7.4.0 python-dateutil==2.8.2 pytz==2023.3 six==1.16.0 scipy==1.11.1 setuptools==68.0.0 dask==2022.8.1
