#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
export LANG=en_US.UTF-8
export LANGUAGE=en_US:en
export LC_ALL=en_US.UTF-8
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 7fa1a93c6c8109010a6ff3f604fda83b604e0e97
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 7fa1a93c6c8109010a6ff3f604fda83b604e0e97 tests/project_template/test_settings.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/project_template/test_settings.py b/tests/project_template/test_settings.py
--- a/tests/project_template/test_settings.py
+++ b/tests/project_template/test_settings.py
@@ -38,6 +38,7 @@ def test_middleware_headers(self):
             self.assertEqual(headers, [
                 b'Content-Length: 0',
                 b'Content-Type: text/html; charset=utf-8',
+                b'Referrer-Policy: same-origin',
                 b'X-Content-Type-Options: nosniff',
                 b'X-Frame-Options: DENY',
             ])

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 project_template.test_settings
git checkout 7fa1a93c6c8109010a6ff3f604fda83b604e0e97 tests/project_template/test_settings.py
