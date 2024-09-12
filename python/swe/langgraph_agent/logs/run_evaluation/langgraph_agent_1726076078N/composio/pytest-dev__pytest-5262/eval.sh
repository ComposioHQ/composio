#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 58e6a09db49f34886ff13f3b7520dd0bcd7063cd
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 58e6a09db49f34886ff13f3b7520dd0bcd7063cd testing/test_capture.py
git apply -v - <<'EOF_114329324912'
diff --git a/testing/test_capture.py b/testing/test_capture.py
--- a/testing/test_capture.py
+++ b/testing/test_capture.py
@@ -1051,6 +1051,9 @@ def test_simple_resume_suspend(self, tmpfile):
             cap.done()
             pytest.raises(AttributeError, cap.suspend)
 
+    def test_capfd_sys_stdout_mode(self, capfd):
+        assert "b" not in sys.stdout.mode
+
 
 @contextlib.contextmanager
 def saved_fd(fd):

EOF_114329324912
pytest -rA testing/test_capture.py
git checkout 58e6a09db49f34886ff13f3b7520dd0bcd7063cd testing/test_capture.py
