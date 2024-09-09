#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff a7b7260bf06c20d408215d95ce20a1a01c12e5b1
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout a7b7260bf06c20d408215d95ce20a1a01c12e5b1 lib/matplotlib/tests/test_dates.py
git apply -v - <<'EOF_114329324912'
diff --git a/lib/matplotlib/tests/test_dates.py b/lib/matplotlib/tests/test_dates.py
--- a/lib/matplotlib/tests/test_dates.py
+++ b/lib/matplotlib/tests/test_dates.py
@@ -630,6 +630,10 @@ def test_offset_changes():
     ax.set_xlim(d1, d1 + datetime.timedelta(weeks=3))
     fig.draw_without_rendering()
     assert formatter.get_offset() == '1997-Jan'
+    ax.set_xlim(d1 + datetime.timedelta(weeks=7),
+                d1 + datetime.timedelta(weeks=30))
+    fig.draw_without_rendering()
+    assert formatter.get_offset() == '1997'
     ax.set_xlim(d1, d1 + datetime.timedelta(weeks=520))
     fig.draw_without_rendering()
     assert formatter.get_offset() == ''

EOF_114329324912
pytest -rA lib/matplotlib/tests/test_dates.py
git checkout a7b7260bf06c20d408215d95ce20a1a01c12e5b1 lib/matplotlib/tests/test_dates.py
