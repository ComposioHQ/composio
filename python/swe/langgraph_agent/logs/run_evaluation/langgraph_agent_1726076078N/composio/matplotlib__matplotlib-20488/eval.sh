#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff b7ce415c15eb39b026a097a2865da73fbcf15c9c
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout b7ce415c15eb39b026a097a2865da73fbcf15c9c lib/matplotlib/tests/test_image.py
git apply -v - <<'EOF_114329324912'
diff --git a/lib/matplotlib/tests/test_image.py b/lib/matplotlib/tests/test_image.py
--- a/lib/matplotlib/tests/test_image.py
+++ b/lib/matplotlib/tests/test_image.py
@@ -1233,23 +1233,24 @@ def test_imshow_quantitynd():
     fig.canvas.draw()
 
 
+@pytest.mark.parametrize('x', [-1, 1])
 @check_figures_equal(extensions=['png'])
-def test_huge_range_log(fig_test, fig_ref):
-    data = np.full((5, 5), -1, dtype=np.float64)
+def test_huge_range_log(fig_test, fig_ref, x):
+    # parametrize over bad lognorm -1 values and large range 1 -> 1e20
+    data = np.full((5, 5), x, dtype=np.float64)
     data[0:2, :] = 1E20
 
     ax = fig_test.subplots()
-    im = ax.imshow(data, norm=colors.LogNorm(vmin=100, vmax=data.max()),
-                   interpolation='nearest', cmap='viridis')
+    ax.imshow(data, norm=colors.LogNorm(vmin=1, vmax=data.max()),
+              interpolation='nearest', cmap='viridis')
 
-    data = np.full((5, 5), -1, dtype=np.float64)
+    data = np.full((5, 5), x, dtype=np.float64)
     data[0:2, :] = 1000
 
-    cmap = copy(plt.get_cmap('viridis'))
-    cmap.set_under('w')
     ax = fig_ref.subplots()
-    im = ax.imshow(data, norm=colors.Normalize(vmin=100, vmax=data.max()),
-                   interpolation='nearest', cmap=cmap)
+    cmap = plt.get_cmap('viridis').with_extremes(under='w')
+    ax.imshow(data, norm=colors.Normalize(vmin=1, vmax=data.max()),
+              interpolation='nearest', cmap=cmap)
 
 
 @check_figures_equal()

EOF_114329324912
pytest -rA lib/matplotlib/tests/test_image.py
git checkout b7ce415c15eb39b026a097a2865da73fbcf15c9c lib/matplotlib/tests/test_image.py
