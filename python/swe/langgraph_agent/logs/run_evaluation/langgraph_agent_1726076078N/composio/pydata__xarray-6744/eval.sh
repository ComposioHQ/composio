#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 7cc6cc991e586a6158bb656b8001234ccda25407
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 7cc6cc991e586a6158bb656b8001234ccda25407 xarray/tests/test_rolling.py
git apply -v - <<'EOF_114329324912'
diff --git a/xarray/tests/test_rolling.py b/xarray/tests/test_rolling.py
--- a/xarray/tests/test_rolling.py
+++ b/xarray/tests/test_rolling.py
@@ -27,8 +27,10 @@
 
 class TestDataArrayRolling:
     @pytest.mark.parametrize("da", (1, 2), indirect=True)
-    def test_rolling_iter(self, da) -> None:
-        rolling_obj = da.rolling(time=7)
+    @pytest.mark.parametrize("center", [True, False])
+    @pytest.mark.parametrize("size", [1, 2, 3, 7])
+    def test_rolling_iter(self, da: DataArray, center: bool, size: int) -> None:
+        rolling_obj = da.rolling(time=size, center=center)
         rolling_obj_mean = rolling_obj.mean()
 
         assert len(rolling_obj.window_labels) == len(da["time"])
@@ -40,14 +42,7 @@ def test_rolling_iter(self, da) -> None:
             actual = rolling_obj_mean.isel(time=i)
             expected = window_da.mean("time")
 
-            # TODO add assert_allclose_with_nan, which compares nan position
-            # as well as the closeness of the values.
-            assert_array_equal(actual.isnull(), expected.isnull())
-            if (~actual.isnull()).sum() > 0:
-                np.allclose(
-                    actual.values[actual.values.nonzero()],
-                    expected.values[expected.values.nonzero()],
-                )
+            np.testing.assert_allclose(actual.values, expected.values)
 
     @pytest.mark.parametrize("da", (1,), indirect=True)
     def test_rolling_repr(self, da) -> None:

EOF_114329324912
pytest -rA xarray/tests/test_rolling.py
git checkout 7cc6cc991e586a6158bb656b8001234ccda25407 xarray/tests/test_rolling.py
