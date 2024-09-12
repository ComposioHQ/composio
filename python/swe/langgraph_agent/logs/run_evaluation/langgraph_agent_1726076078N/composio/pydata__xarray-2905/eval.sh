#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 7c4e2ac83f7b4306296ff9b7b51aaf016e5ad614
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 7c4e2ac83f7b4306296ff9b7b51aaf016e5ad614 xarray/tests/test_variable.py
git apply -v - <<'EOF_114329324912'
diff --git a/xarray/tests/test_variable.py b/xarray/tests/test_variable.py
--- a/xarray/tests/test_variable.py
+++ b/xarray/tests/test_variable.py
@@ -2300,6 +2300,11 @@ def __init__(self, array):
         class CustomIndexable(CustomArray, indexing.ExplicitlyIndexed):
             pass
 
+        # Type with data stored in values attribute
+        class CustomWithValuesAttr:
+            def __init__(self, array):
+                self.values = array
+
         array = CustomArray(np.arange(3))
         orig = Variable(dims=("x"), data=array, attrs={"foo": "bar"})
         assert isinstance(orig._data, np.ndarray)  # should not be CustomArray
@@ -2308,6 +2313,10 @@ class CustomIndexable(CustomArray, indexing.ExplicitlyIndexed):
         orig = Variable(dims=("x"), data=array, attrs={"foo": "bar"})
         assert isinstance(orig._data, CustomIndexable)
 
+        array = CustomWithValuesAttr(np.arange(3))
+        orig = Variable(dims=(), data=array)
+        assert isinstance(orig._data.item(), CustomWithValuesAttr)
+
 
 def test_raise_no_warning_for_nan_in_binary_ops():
     with pytest.warns(None) as record:

EOF_114329324912
pytest -rA xarray/tests/test_variable.py
git checkout 7c4e2ac83f7b4306296ff9b7b51aaf016e5ad614 xarray/tests/test_variable.py
