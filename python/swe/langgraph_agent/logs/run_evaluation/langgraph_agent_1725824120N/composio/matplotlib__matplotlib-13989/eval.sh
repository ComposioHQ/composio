#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff a3e2897bfaf9eaac1d6649da535c4e721c89fa69
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout a3e2897bfaf9eaac1d6649da535c4e721c89fa69 lib/matplotlib/tests/test_axes.py
git apply -v - <<'EOF_114329324912'
diff --git a/lib/matplotlib/tests/test_axes.py b/lib/matplotlib/tests/test_axes.py
--- a/lib/matplotlib/tests/test_axes.py
+++ b/lib/matplotlib/tests/test_axes.py
@@ -6369,3 +6369,10 @@ def test_hist_nan_data():
 
     assert np.allclose(bins, nanbins)
     assert np.allclose(edges, nanedges)
+
+
+def test_hist_range_and_density():
+    _, bins, _ = plt.hist(np.random.rand(10), "auto",
+                          range=(0, 1), density=True)
+    assert bins[0] == 0
+    assert bins[-1] == 1

EOF_114329324912
pytest -rA lib/matplotlib/tests/test_axes.py
git checkout a3e2897bfaf9eaac1d6649da535c4e721c89fa69 lib/matplotlib/tests/test_axes.py
