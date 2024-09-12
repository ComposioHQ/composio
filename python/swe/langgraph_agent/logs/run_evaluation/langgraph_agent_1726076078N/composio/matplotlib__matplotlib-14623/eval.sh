#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff d65c9ca20ddf81ef91199e6d819f9d3506ef477c
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout d65c9ca20ddf81ef91199e6d819f9d3506ef477c lib/matplotlib/tests/test_axes.py
git apply -v - <<'EOF_114329324912'
diff --git a/lib/matplotlib/tests/test_axes.py b/lib/matplotlib/tests/test_axes.py
--- a/lib/matplotlib/tests/test_axes.py
+++ b/lib/matplotlib/tests/test_axes.py
@@ -936,7 +936,12 @@ def test_inverted_limits():
 
     assert ax.get_xlim() == (-5, 4)
     assert ax.get_ylim() == (5, -3)
-    plt.close()
+
+    # Test inverting nonlinear axes.
+    fig, ax = plt.subplots()
+    ax.set_yscale("log")
+    ax.set_ylim(10, 1)
+    assert ax.get_ylim() == (10, 1)
 
 
 @image_comparison(baseline_images=['nonfinite_limits'])

EOF_114329324912
pytest -rA lib/matplotlib/tests/test_axes.py
git checkout d65c9ca20ddf81ef91199e6d819f9d3506ef477c lib/matplotlib/tests/test_axes.py
